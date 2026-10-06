import OpenAI from 'openai';
import { getConfig } from '$lib/config';
import { netFetch } from '$lib/platform/net';
import type { TreeNode } from '$lib/types';
import type { DocumentOptions } from '$lib/types';
import { swarmUIGenerate } from '$lib/swarmui';
import { makeSection, makeContent } from '$lib/types';
import { buildTextBlockPrompt } from '$lib/prompts/textBlock';
import { buildImagePrompt } from '$lib/prompts/image';
import { buildCodePrompt } from '$lib/prompts/code';
import { buildEquationPrompt } from '$lib/prompts/equation';
import { buildTablePrompt } from '$lib/prompts/table';
import { buildSingleVoicePrompt } from '$lib/prompts/section';
import { buildBackgroundContext } from '$lib/contextExtractor';
import {
	buildDocumentOutline,
	collectAllReferences,
	buildExecutiveSummaryPrompt,
	buildIntroductionPrompt,
	buildConclusionPrompt,
	buildReferencesPrompt,
} from '$lib/prompts/documentSections';

export interface GenerationOptions {
	signal?: AbortSignal;
	onNodeStart?: (node: TreeNode) => void;
}

function createOpenAI(): OpenAI {
	const config = getConfig();
	return new OpenAI({ baseURL: config.baseURL, apiKey: config.apiKey, dangerouslyAllowBrowser: true, fetch: netFetch });
}

// Yield to the macrotask queue so Svelte can flush DOM updates between chunks.
// Without this, all chunks land in a microtask chain and the browser never
// gets a paint opportunity until the entire stream finishes.
function yieldToDOM(): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, 0));
}

async function streamToNode(
	openai: OpenAI,
	model: string,
	prompt: string,
	node: TreeNode,
	options?: GenerationOptions,
): Promise<void> {
	node.generated_content = '';
	const requestOptions = options?.signal ? { signal: options.signal } : undefined;
	const stream = await openai.chat.completions.create(
		{ model, messages: [{ role: 'user', content: prompt }], stream: true },
		requestOptions,
	);
	for await (const chunk of stream) {
		node.generated_content += chunk.choices[0]?.delta?.content ?? '';
		await yieldToDOM();
	}
}

/**
 * Generate a single content item.
 */
export async function generateItem(
	node: TreeNode,
	section: TreeNode | null,
	sectionChain: TreeNode[] = [],
	options?: GenerationOptions,
): Promise<void> {
	const config = getConfig();
	const openai = createOpenAI();

	const contextNodes = section ? [...sectionChain, section, node] : [...sectionChain, node];
	const background = await buildBackgroundContext(contextNodes);

	if (node.type === 'text_block') {
		options?.onNodeStart?.(node);
		const prompt = buildTextBlockPrompt(node, section, background);
		await streamToNode(openai, config.model, prompt, node, options);
	} else if (node.type === 'image') {
		options?.onNodeStart?.(node);
		const prompt = node.content?.trim() || buildImagePrompt(node, section, background);
		if (config.imageBaseURL) {
			const result = await swarmUIGenerate(prompt, {
				baseURL: config.imageBaseURL,
				swarmToken: config.imageSwarmToken || undefined,
				model: config.imageModel || undefined,
				endpoint: config.imageEndpoint,
				width: config.imageWidth,
				height: config.imageHeight,
				steps: config.imageSteps,
				cfgScale: config.imageCfgScale,
			});
			node.imageUrl = result.dataUrl;
			node.generated_content = result.prompt;
		} else if (config.imageModel) {
			const imageClient = new OpenAI({
				baseURL: config.imageApiBaseURL || config.baseURL,
				apiKey: config.imageApiKey || config.apiKey,
				dangerouslyAllowBrowser: true,
				fetch: netFetch,
			});
			const res = await imageClient.images.generate({
				model: config.imageModel,
				prompt,
				n: 1,
				size: `${config.imageWidth}x${config.imageHeight}` as Parameters<typeof imageClient.images.generate>[0]['size'],
				response_format: 'b64_json',
			});
			const item = res.data?.[0];
			if (item?.b64_json) {
				node.imageUrl = `data:image/png;base64,${item.b64_json}`;
			} else if (item?.url) {
				node.imageUrl = item.url;
			}
			node.generated_content = prompt;
		} else {
			// No image backend configured — generate a text description instead.
			const imagePrompt = buildImagePrompt(node, section, background);
			await streamToNode(openai, config.model, imagePrompt, node, options);
			node.altText = node.generated_content ?? '';
		}
	} else if (node.type === 'code') {
		options?.onNodeStart?.(node);
		const prompt = buildCodePrompt(node, section, background);
		await streamToNode(openai, config.model, prompt, node, options);
	} else if (node.type === 'equation') {
		options?.onNodeStart?.(node);
		const prompt = buildEquationPrompt(node, section, background);
		await streamToNode(openai, config.model, prompt, node, options);
		node.generated_content = node.generated_content?.trim() ?? '';
	} else if (node.type === 'table') {
		options?.onNodeStart?.(node);
		const prompt = buildTablePrompt(node, section, background);
		await streamToNode(openai, config.model, prompt, node, options);
		node.generated_content = node.generated_content?.trim() ?? '';
	}
}

/**
 * Generate all children of a section, then unify text_block voices.
 */
export async function generateSection(
	section: TreeNode,
	sectionChain: TreeNode[],
	uid: { current: number },
	options?: GenerationOptions,
): Promise<void> {
	const config = getConfig();
	const openai = createOpenAI();

	if (section.children.length === 0) {
		section.children.push({
			id: 'n' + (uid.current++),
			type: 'text_block',
			label: section.label,
			desc: '',
			open: false,
			children: [],
			content: '',
			generate: true,
			paragraphs: 1,
			altText: '',
			imageUrl: '',
			imageFile: null,
			description: section.description,
			purpose: section.purpose,
			key_points: section.key_points,
			conclusion: section.conclusion,
			additional_details: section.additional_details,
			references: [],
			attachments: [],
			storedAttachments: [],
			generated_content: null,
		});
	}

	const childChain = [...sectionChain, section];

	for (const child of section.children) {
		if (child.type === 'section') {
			await generateSection(child, childChain, uid, options);
		} else if (child.generate === true && child.generated_content === null) {
			await generateItem(child, section, sectionChain, options);
		}
	}

	// Single-voice rewrite for multiple text_block children.
	const textKids = section.children.filter((c) => c.type === 'text_block');
	if (textKids.length > 1) {
		const items = textKids
			.map((c) => ({ label: c.label, content: (c.generated_content ?? c.content ?? '').trim() }))
			.filter((item) => item.content);
		if (items.length > 1) {
			const prompt = buildSingleVoicePrompt(section, items);

			// Mark first text block active so the preview shows the pulsing cursor.
			options?.onNodeStart?.(textKids[0]);
			textKids[0].generated_content = '';

			const requestOptions = options?.signal ? { signal: options.signal } : undefined;
			const stream = await openai.chat.completions.create(
				{ model: config.model, messages: [{ role: 'user', content: prompt }], stream: true },
				requestOptions,
			);
			let fullContent = '';
			for await (const chunk of stream) {
				const delta = chunk.choices[0]?.delta?.content ?? '';
				fullContent += delta;
				// Stream into the first text block for live visual feedback until
				// the <<<BREAK>>> delimiter arrives (marking end of first block).
				if (!fullContent.includes('<<<BREAK>>>')) {
					textKids[0].generated_content = fullContent;
				}
				await yieldToDOM();
			}

			const parts = fullContent
				.split(/<<<BREAK>>>/i)
				.map((p) => p.trim())
				.filter(Boolean);
			textKids.forEach((child, i) => {
				if (parts[i]) child.generated_content = parts[i];
			});
			section.generated_content = parts.join('\n\n');
		}
	} else if (textKids.length === 1) {
		section.generated_content = (textKids[0].generated_content ?? textKids[0].content ?? '').trim();
	}
}

export async function generateDocument(
	tree: TreeNode[],
	uid: { current: number },
	options?: GenerationOptions,
): Promise<void> {
	for (const node of tree) {
		if (node.type === 'section') {
			await generateSection(node, [], uid, options);
		} else if (node.generate === true && node.generated_content === null) {
			await generateItem(node, null, [], options);
		}
	}
}

// ── Special document sections ──────────────────────────────────────────────

const SPECIAL_LABELS = {
	executiveSummary: 'Executive Summary',
	introduction: 'Introduction',
	conclusion: 'Conclusion',
	references: 'References',
} as const;

function upsertSpecialSection(
	tree: TreeNode[],
	label: string,
	position: 'prepend' | 'append',
	uid: { current: number },
): TreeNode {
	const existing = tree.find((n) => n.type === 'section' && n.label === label);
	if (existing) return existing;

	const section = makeSection('n' + (uid.current++), label);
	section.children.push(makeContent('n' + (uid.current++), 'text_block', label));

	if (position === 'prepend') {
		tree.unshift(section);
	} else {
		tree.push(section);
	}
	return section;
}

async function generateSpecialSection(
	openai: OpenAI,
	model: string,
	section: TreeNode,
	prompt: string,
	options?: GenerationOptions,
): Promise<void> {
	const child = section.children.find((c) => c.type === 'text_block') ?? section;
	options?.onNodeStart?.(child);
	await streamToNode(openai, model, prompt, child, options);
	section.generated_content = child.generated_content ?? '';
}

export async function generateSpecialSections(
	tree: TreeNode[],
	options: DocumentOptions,
	documentTitle: string,
	uid: { current: number },
	genOptions?: GenerationOptions,
): Promise<void> {
	const { generateExecutiveSummary, generateIntroduction, generateConclusion, generateReferences } = options;
	if (!generateExecutiveSummary && !generateIntroduction && !generateConclusion && !generateReferences) return;

	const config = getConfig();
	const openai = createOpenAI();
	const outline = buildDocumentOutline(tree);
	const allUrls = collectAllReferences(tree);

	if (generateIntroduction) {
		const section = upsertSpecialSection(tree, SPECIAL_LABELS.introduction, 'prepend', uid);
		await generateSpecialSection(openai, config.model, section, buildIntroductionPrompt(documentTitle, outline), genOptions);
	}

	if (generateExecutiveSummary) {
		const section = upsertSpecialSection(tree, SPECIAL_LABELS.executiveSummary, 'prepend', uid);
		await generateSpecialSection(openai, config.model, section, buildExecutiveSummaryPrompt(documentTitle, outline), genOptions);
	}

	if (generateConclusion) {
		const section = upsertSpecialSection(tree, SPECIAL_LABELS.conclusion, 'append', uid);
		await generateSpecialSection(openai, config.model, section, buildConclusionPrompt(documentTitle, outline), genOptions);
	}

	if (generateReferences) {
		const section = upsertSpecialSection(tree, SPECIAL_LABELS.references, 'append', uid);
		await generateSpecialSection(openai, config.model, section, buildReferencesPrompt(documentTitle, outline, allUrls), genOptions);
	}
}

export const CONTENT_TYPE_LABELS: Record<string, string> = {
	text_block: 'Text Block',
	image: 'Image',
	code: 'Code',
	equation: 'Equation',
	table: 'Table',
};

// Mono glyphs, not emoji (NEONDECK rule). Decorative: the label beside them carries the meaning.
export const CONTENT_TYPE_ICONS: Record<string, string> = {
	text_block: '¶',
	image: 'IMG',
	code: '</>',
	equation: 'ƒx',
	table: '⊞',
};

// NEONDECK Tag tones per content type.
export const CONTENT_TYPE_TONES: Record<string, 'accent' | 'accent-2' | 'success' | 'info' | 'warning' | 'danger' | 'muted'> = {
	text_block: 'warning',
	image: 'success',
	code: 'accent',
	equation: 'accent-2',
	table: 'muted',
};

import type { TreeNode } from '$lib/types';
import { isSection } from '$lib/types';
import { netFetch } from '$lib/platform/net';

// ── Per-source content limits ──────────────────────────────────────────────
const URL_CHAR_LIMIT = 2000;
const FILE_CHAR_LIMIT = 3000;
const TOTAL_BG_LIMIT = 10000;

// ── Tree traversal ─────────────────────────────────────────────────────────

/**
 * Returns the chain of ancestor SECTIONS from root down to (but not including)
 * the node with the given id. Used to collect references/attachments that
 * should provide background context for generation.
 */
export function findAncestors(
	nodeId: string,
	tree: TreeNode[],
): TreeNode[] {
	function search(nodes: TreeNode[], target: string, path: TreeNode[]): TreeNode[] | null {
		for (const node of nodes) {
			if (node.id === target) return path;
			if (node.children?.length) {
				const next = isSection(node) ? [...path, node] : path;
				const result = search(node.children, target, next);
				if (result !== null) return result;
			}
		}
		return null;
	}
	return search(tree, nodeId, []) ?? [];
}

// ── URL fetching ───────────────────────────────────────────────────────────

export async function fetchUrlContent(url: string): Promise<string> {
	try {
		const res = await netFetch(url, { signal: AbortSignal.timeout(8000) });
		if (!res.ok) return '';
		const ct = res.headers.get('content-type') ?? '';
		if (!ct.includes('text') && !ct.includes('json') && !ct.includes('xml')) return '';
		const text = await res.text();
		// Strip HTML tags for cleaner context
		return text
			.replace(/<script[\s\S]*?<\/script>/gi, '')
			.replace(/<style[\s\S]*?<\/style>/gi, '')
			.replace(/<[^>]+>/g, ' ')
			.replace(/\s{2,}/g, ' ')
			.trim()
			.slice(0, URL_CHAR_LIMIT);
	} catch {
		return '';
	}
}

// ── File text extraction ───────────────────────────────────────────────────

async function parseDocx(file: File): Promise<string> {
	const JSZip = (await import('jszip')).default;
	const zip = await JSZip.loadAsync(await file.arrayBuffer());
	const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
	// Extract <w:t> text runs (preserves word boundaries better than stripping all tags)
	const runs = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)];
	return runs
		.map((m) => m[1])
		.join(' ')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

async function parseOdt(file: File): Promise<string> {
	const JSZip = (await import('jszip')).default;
	const zip = await JSZip.loadAsync(await file.arrayBuffer());
	const xml = (await zip.file('content.xml')?.async('string')) ?? '';
	return xml
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

async function parsePdf(file: File): Promise<string> {
	// Dynamically import pdfjs so it never runs during SSR
	const pdfjsLib = await import('pdfjs-dist');
	pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
		'pdfjs-dist/build/pdf.worker.mjs',
		import.meta.url,
	).href;

	const data = await file.arrayBuffer();
	const pdf = await pdfjsLib.getDocument({ data }).promise;
	const pages: string[] = [];
	for (let i = 1; i <= pdf.numPages; i++) {
		const page = await pdf.getPage(i);
		const content = await page.getTextContent();
		const pageText = content.items
			.map((item) => ('str' in item ? item.str : ''))
			.join(' ');
		pages.push(pageText);
	}
	return pages.join('\n').replace(/\s{2,}/g, ' ').trim();
}

export async function extractFileText(file: File): Promise<string> {
	const name = file.name.toLowerCase();
	try {
		let text = '';
		if (name.endsWith('.md') || name.endsWith('.txt') || name.endsWith('.mdx')) {
			text = await file.text();
		} else if (name.endsWith('.docx')) {
			text = await parseDocx(file);
		} else if (name.endsWith('.odt')) {
			text = await parseOdt(file);
		} else if (name.endsWith('.pdf')) {
			text = await parsePdf(file);
		}
		return text.slice(0, FILE_CHAR_LIMIT);
	} catch (err) {
		console.warn(`Failed to extract text from ${file.name}:`, err);
		return '';
	}
}

// ── Background context builder ─────────────────────────────────────────────

/**
 * Fetches and extracts text from all references (URLs) and attachments
 * on the given nodes (typically: ancestor sections + the node itself).
 * Returns a formatted string ready for inclusion in an AI prompt,
 * or an empty string if nothing was found.
 */
export async function buildBackgroundContext(nodes: TreeNode[]): Promise<string> {
	const parts: string[] = [];

	for (const node of nodes) {
		// URL references
		for (const url of node.references ?? []) {
			if (!url.trim()) continue;
			const content = await fetchUrlContent(url.trim());
			if (content) {
				parts.push(`[Reference: ${url}]\n${content}`);
			}
		}

		// Persisted stored attachments (text already extracted on upload)
		for (const sa of node.storedAttachments ?? []) {
			if (sa.text) {
				parts.push(`[Attachment: ${sa.name}]\n${sa.text}`);
			}
		}

		// In-session File attachments (newly uploaded this session, not yet persisted)
		for (const file of node.attachments ?? []) {
			const content = await extractFileText(file);
			if (content) {
				parts.push(`[Attachment: ${file.name}]\n${content}`);
			}
		}
	}

	if (parts.length === 0) return '';

	const joined = parts.join('\n\n').slice(0, TOTAL_BG_LIMIT);
	return `Background context from references and attached documents:\n\n${joined}`;
}

// ── Supported file types ───────────────────────────────────────────────────

/** The accept string for <input type="file"> elements. */
export const ACCEPTED_ATTACHMENT_TYPES =
	'.md,.mdx,.txt,.docx,.odt,.pdf,' +
	'text/markdown,text/plain,' +
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
	'application/vnd.oasis.opendocument.text,' +
	'application/pdf';

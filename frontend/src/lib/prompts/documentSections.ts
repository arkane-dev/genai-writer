import type { TreeNode } from '$lib/types';

// ── Document outline builder ───────────────────────────────────────────────

/**
 * Walks the tree and returns a compact textual outline suitable for use as
 * context in executive summary / introduction / conclusion / references prompts.
 */
export function buildDocumentOutline(tree: TreeNode[], depth = 0): string {
	const lines: string[] = [];
	const prefix = '  '.repeat(depth);
	for (const node of tree) {
		if (node.type === 'section') {
			lines.push(`${prefix}Section: ${node.label}${node.desc ? ` — ${node.desc}` : ''}`);
			if (node.key_points) lines.push(`${prefix}  Key points: ${node.key_points}`);
			if (node.purpose) lines.push(`${prefix}  Purpose: ${node.purpose}`);
			if (node.generated_content) {
				const snippet = node.generated_content.slice(0, 300).replace(/\n+/g, ' ');
				lines.push(`${prefix}  Content summary: ${snippet}…`);
			}
			if (node.children?.length) {
				lines.push(buildDocumentOutline(node.children, depth + 1));
			}
		} else {
			const content = (node.generated_content ?? node.content ?? '').slice(0, 200).replace(/\n+/g, ' ');
			if (content) lines.push(`${prefix}  [${node.label}]: ${content}…`);
		}
	}
	return lines.filter(Boolean).join('\n');
}

/**
 * Recursively collects all non-empty reference URLs from every node in the tree.
 */
export function collectAllReferences(tree: TreeNode[]): string[] {
	const urls: string[] = [];
	for (const node of tree) {
		for (const ref of node.references ?? []) {
			if (ref.trim()) urls.push(ref.trim());
		}
		if (node.children?.length) urls.push(...collectAllReferences(node.children));
	}
	// Deduplicate while preserving order
	return [...new Set(urls)];
}

// ── Prompt builders ────────────────────────────────────────────────────────

export function buildExecutiveSummaryPrompt(
	documentTitle: string,
	outline: string,
): string {
	return [
		`Write a concise executive summary for the following document${documentTitle ? ` titled "${documentTitle}"` : ''}.`,
		'The executive summary should:',
		'- Be 2–4 paragraphs long',
		'- State the purpose and scope of the document',
		'- Highlight the key findings, conclusions, or recommendations',
		'- Be written for a reader who may not read the full document',
		'',
		'Document outline:',
		outline,
		'',
		'Write only the executive summary text. No headings.',
	]
		.filter((l) => l !== undefined)
		.join('\n');
}

export function buildIntroductionPrompt(
	documentTitle: string,
	outline: string,
): string {
	return [
		`Write an introduction section for the following document${documentTitle ? ` titled "${documentTitle}"` : ''}.`,
		'The introduction should:',
		'- Open with context that motivates the document',
		'- State the purpose, objectives, and scope',
		'- Briefly outline what each section covers (signposting)',
		'- Be written in a tone appropriate to the document subject',
		'',
		'Document outline:',
		outline,
		'',
		'Write only the introduction text. No headings.',
	]
		.filter((l) => l !== undefined)
		.join('\n');
}

export function buildConclusionPrompt(
	documentTitle: string,
	outline: string,
): string {
	return [
		`Write a conclusion section for the following document${documentTitle ? ` titled "${documentTitle}"` : ''}.`,
		'The conclusion should:',
		'- Synthesise the key points covered across all sections',
		'- Restate the most important findings or outcomes',
		'- Offer final thoughts, recommendations, or next steps where appropriate',
		'- Not introduce new information',
		'',
		'Document outline:',
		outline,
		'',
		'Write only the conclusion text. No headings.',
	]
		.filter((l) => l !== undefined)
		.join('\n');
}

export function buildReferencesPrompt(
	documentTitle: string,
	outline: string,
	urls: string[],
): string {
	const urlBlock =
		urls.length > 0
			? `\nThe following URLs are referenced in the document:\n${urls.map((u, i) => `${i + 1}. ${u}`).join('\n')}`
			: '';

	return [
		`Compile a references section for the following document${documentTitle ? ` titled "${documentTitle}"` : ''}.`,
		'The references section should:',
		'- List all sources, citations, and references mentioned or implied by the document content',
		'- Format each entry consistently (APA or a clear numbered list)',
		'- Include the provided URLs formatted as proper citations where possible',
		'- Add any additional authoritative sources that would typically be cited for the topics covered',
		'',
		'Document outline:',
		outline,
		urlBlock,
		'',
		'Write only the references list. No additional prose.',
	]
		.filter((l) => l !== undefined && l !== '')
		.join('\n');
}

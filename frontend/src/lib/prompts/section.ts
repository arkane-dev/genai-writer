import type { TreeNode } from '$lib/types';

export function buildSingleVoicePrompt(
	section: TreeNode,
	items: { label: string; content: string }[]
): string {
	const inputBlocks = items
		.map((item, i) => `[Block ${i + 1}: ${item.label}]\n${item.content}`)
		.join('\n\n');

	return [
		`Rewrite the following ${items.length} text blocks from the document section "${section.label}" so they read as a single, cohesive piece.`,
		section.description ? `Section context: ${section.description}` : '',
		section.purpose ? `Section purpose: ${section.purpose}` : '',
		`Preserve all information from every block. Return ONLY the ${items.length} rewritten blocks separated by the delimiter "<<<BREAK>>>" on its own line, in the same order as the input. No labels, no extra commentary.`,
		'',
		inputBlocks,
	]
		.filter((s) => s !== '')
		.join('\n');
}

import type { TreeNode } from '$lib/types';

export function buildTablePrompt(
	node: TreeNode,
	section: TreeNode | null,
	background?: string,
): string {
	return [
		`Create a structured Markdown table titled "${node.label}".`,
		section?.label ? `This table is part of a document section about "${section.label}".` : '',
		node.description ? `Description: ${node.description}` : '',
		node.purpose ? `Purpose: ${node.purpose}` : '',
		node.key_points ? `Columns or data to include: ${node.key_points}` : '',
		node.conclusion ? `Notes: ${node.conclusion}` : '',
		node.additional_details ? `Additional context: ${node.additional_details}` : '',
		background ? `\n${background}` : '',
		'Return ONLY a valid Markdown table using pipe syntax (| col | col |\\n| --- | --- |\\n| val | val |). No preamble, no explanation.',
	]
		.filter(Boolean)
		.join('\n');
}

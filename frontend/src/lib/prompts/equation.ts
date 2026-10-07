import type { TreeNode } from '$lib/types';

export function buildEquationPrompt(node: TreeNode, section: TreeNode | null, background?: string): string {
	return [
		`Write a LaTeX equation for: "${node.label}"`,
		section?.label ? `Context: part of a document section about "${section.label}".` : '',
		node.content?.trim() ? `What the equation should show: ${node.content.trim()}` : '',
		node.description ? `Description: ${node.description}` : '',
		node.purpose ? `Purpose: ${node.purpose}` : '',
		node.additional_details ? `Additional details: ${node.additional_details}` : '',
		background ? `\n${background}` : '',
		'Return only the LaTeX syntax (e.g. E = mc^2). No dollar-sign delimiters, no explanation.',
	]
		.filter(Boolean)
		.join('\n');
}

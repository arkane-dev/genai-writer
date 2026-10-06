import type { TreeNode } from '$lib/types';

export function buildCodePrompt(node: TreeNode, section: TreeNode | null, background?: string): string {
	return [
		`Write code for: "${node.label}"`,
		section?.label ? `Context: part of a document section about "${section.label}".` : '',
		node.description ? `What it does: ${node.description}` : '',
		node.purpose ? `Purpose: ${node.purpose}` : '',
		node.key_points ? `Requirements: ${node.key_points}` : '',
		node.additional_details ? `Additional details: ${node.additional_details}` : '',
		background ? `\n${background}` : '',
		'Return only the code with no explanations or markdown code fences.',
	]
		.filter(Boolean)
		.join('\n');
}

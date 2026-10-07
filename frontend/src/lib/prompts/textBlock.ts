import type { TreeNode } from '$lib/types';

export function buildTextBlockPrompt(node: TreeNode, section: TreeNode | null, background?: string): string {
	const paragraphs = node.paragraphs ?? 1;
	return [
		`Write a text block titled "${node.label}" for a document.`,
		section?.label ? `This block is part of a section called "${section.label}".` : '',
		node.content?.trim() ? `What to write: ${node.content.trim()}` : '',
		node.description ? `Description: ${node.description}` : '',
		node.purpose ? `Purpose: ${node.purpose}` : '',
		node.key_points ? `Key points to cover: ${node.key_points}` : '',
		node.conclusion ? `The content should support this conclusion: ${node.conclusion}` : '',
		node.additional_details ? `Additional details: ${node.additional_details}` : '',
		background ? `\n${background}` : '',
		`Write approximately ${paragraphs} ${paragraphs === 1 ? 'paragraph' : 'paragraphs'}. Write only the paragraph text. No headings or titles.`,
	]
		.filter(Boolean)
		.join('\n');
}

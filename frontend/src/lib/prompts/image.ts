import type { TreeNode } from '$lib/types';

export function buildImagePrompt(node: TreeNode, section: TreeNode | null, background?: string): string {
	return [
		`Create an image generation prompt for an image titled "${node.label}".`,
		section?.label ? `It accompanies a document section called "${section.label}".` : '',
		node.description ? `Description: ${node.description}` : '',
		node.purpose ? `Purpose of the image: ${node.purpose}` : '',
		node.additional_details ? `Additional context: ${node.additional_details}` : '',
		background ? `\n${background}` : '',
		'Return only the image generation prompt. Be specific and visually descriptive.',
	]
		.filter(Boolean)
		.join('\n');
}

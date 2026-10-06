export type NodeType = 'section' | 'text_block' | 'image' | 'code' | 'equation' | 'table';

/** An uploaded file, kept with the node as extracted text so it survives reloads. */
export interface StoredAttachment {
	name: string;
	text: string;
}

export interface TreeNode {
	id: string;
	type: NodeType;
	label: string;
	desc: string;
	open: boolean;
	children: TreeNode[];
	// AI prompting metadata
	description: string;
	purpose: string;
	key_points: string;
	conclusion: string;
	additional_details: string;
	references: string[];
	attachments: File[];
	storedAttachments?: StoredAttachment[];
	// Content fields
	generated_content: string | null;
	content: string;
	generate: boolean;
	paragraphs: number;
	altText: string;
	imageUrl: string;
	imageFile: File | null;
}

export interface DocumentOptions {
	generateExecutiveSummary: boolean;
	generateIntroduction: boolean;
	generateConclusion: boolean;
	generateReferences: boolean;
}

export function isSection(node: TreeNode): boolean {
	return node.type === 'section';
}

export function makeSection(id: string, label = 'New Section'): TreeNode {
	return {
		id,
		type: 'section',
		label,
		desc: '',
		open: true,
		children: [],
		description: '',
		purpose: '',
		key_points: '',
		conclusion: '',
		additional_details: '',
		references: [],
		attachments: [],
		generated_content: null,
		content: '',
		generate: false,
		paragraphs: 1,
		altText: '',
		imageUrl: '',
		imageFile: null,
	};
}

export function makeContent(id: string, type: NodeType, label?: string): TreeNode {
	const labels: Record<string, string> = {
		text_block: 'Text Block',
		image: 'Image',
		code: 'Code',
		equation: 'Equation',
		table: 'Table',
	};
	return {
		id,
		type,
		label: label ?? labels[type] ?? type,
		desc: '',
		open: false,
		children: [],
		description: '',
		purpose: '',
		key_points: '',
		conclusion: '',
		additional_details: '',
		references: [],
		attachments: [],
		generated_content: null,
		content: '',
		generate: false,
		paragraphs: 1,
		altText: '',
		imageUrl: '',
		imageFile: null,
	};
}

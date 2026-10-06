import JSZip from 'jszip';
import type { TreeNode } from '$lib/types';

function effectiveContent(node: TreeNode): string {
	return node.generated_content || node.content || '';
}

async function collectImages(
	node: TreeNode,
	images: Map<string, Uint8Array>,
	depth: number
): Promise<string> {
	const heading = '#'.repeat(Math.min(depth, 6));
	const lines: string[] = [];

	if (node.type === 'section') {
		lines.push(`${heading} ${node.label}`);
		if (node.desc) lines.push(`\n*${node.desc}*`);
		for (const child of node.children || []) {
			lines.push('');
			lines.push(await collectImages(child, images, depth + 1));
		}
	} else if (node.type === 'text_block') {
		const text = effectiveContent(node);
		if (text) lines.push(text);
	} else if (node.type === 'image') {
		const alt = node.altText || node.label;
		const src = node.generated_content || node.imageUrl || '';
		if (src.startsWith('data:image/')) {
			const filename = `images/${node.id}.png`;
			const base64 = src.split(',')[1];
			const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
			images.set(filename, binary);
			lines.push(`![${alt}](${filename})`);
		} else if (src) {
			lines.push(`![${alt}](${src})`);
		} else {
			lines.push(`*[Image: ${alt}]*`);
		}
	} else if (node.type === 'code') {
		const code = effectiveContent(node);
		if (code) {
			lines.push(`**${node.label}**`);
			lines.push('');
			lines.push('```');
			lines.push(code);
			lines.push('```');
		}
	} else if (node.type === 'equation') {
		const eq = effectiveContent(node);
		if (eq) {
			lines.push(`**${node.label}**`);
			lines.push('');
			lines.push(`$$${eq}$$`);
		}
	} else if (node.type === 'table') {
		const md = effectiveContent(node);
		if (md) {
			lines.push(`**${node.label}**`);
			lines.push('');
			lines.push(md);
		}
	}

	return lines.join('\n');
}

export async function downloadMarkdownZip(tree: TreeNode[], title: string): Promise<void> {
	const zip = new JSZip();
	const images = new Map<string, Uint8Array>();

	const lines: string[] = [];
	if (title) lines.push(`# ${title}\n`);

	for (const node of tree) {
		lines.push(await collectImages(node, images, title ? 2 : 1));
		lines.push('');
	}

	zip.file('document.md', lines.join('\n'));
	for (const [path, data] of images) {
		zip.file(path, data);
	}

	const blob = await zip.generateAsync({ type: 'blob' });
	triggerDownload(blob, `${sanitizeFilename(title || 'document')}.zip`);
}

function sanitizeFilename(name: string): string {
	return name.replace(/[^a-z0-9_\-. ]/gi, '_').trim() || 'document';
}

export function triggerDownload(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 10000);
}

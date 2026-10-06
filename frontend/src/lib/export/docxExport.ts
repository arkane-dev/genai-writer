import {
	Document,
	Packer,
	Paragraph,
	TextRun,
	HeadingLevel,
	ImageRun,
	AlignmentType,
	Table,
	TableRow,
	TableCell,
	WidthType,
	BorderStyle,
	type IImageOptions,
} from 'docx';
import { triggerDownload } from './markdown';
import type { TreeNode } from '$lib/types';

const HEADING_LEVELS = [
	HeadingLevel.HEADING_1,
	HeadingLevel.HEADING_2,
	HeadingLevel.HEADING_3,
	HeadingLevel.HEADING_4,
	HeadingLevel.HEADING_5,
	HeadingLevel.HEADING_6,
];

function headingLevel(depth: number): (typeof HeadingLevel)[keyof typeof HeadingLevel] {
	return HEADING_LEVELS[Math.min(depth - 1, 5)];
}

function textToParagraphs(text: string): Paragraph[] {
	return text
		.split(/\n\n+/)
		.map((block) => block.trim())
		.filter(Boolean)
		.map(
			(block) =>
				new Paragraph({
					children: [new TextRun(block.replace(/\n/g, ' '))],
				})
		);
}

async function dataUrlToBuffer(dataUrl: string): Promise<{ data: ArrayBuffer; width: number; height: number }> {
	return new Promise((resolve) => {
		const img = new Image();
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = img.naturalWidth || 400;
			canvas.height = img.naturalHeight || 300;
			const ctx = canvas.getContext('2d')!;
			ctx.drawImage(img, 0, 0);
			canvas.toBlob(async (blob) => {
				const buf = await blob!.arrayBuffer();
				resolve({ data: buf, width: canvas.width, height: canvas.height });
			}, 'image/png');
		};
		img.onerror = () => resolve({ data: new ArrayBuffer(0), width: 0, height: 0 });
		img.src = dataUrl;
	});
}

function parseMarkdownTable(md: string): { headers: string[]; rows: string[][] } | null {
	const lines = md.trim().split('\n').map(l => l.trim()).filter(Boolean);
	if (lines.length < 2 || !lines[0].includes('|')) return null;
	const parse = (line: string) => line.split('|').slice(1, -1).map(c => c.trim());
	const isSep = (line: string) => /^\|[\s\-:|]+\|$/.test(line);
	const headers = parse(lines[0]);
	const rows = lines.slice(1).filter(l => l.includes('|') && !isSep(l)).map(parse);
	return headers.length ? { headers, rows } : null;
}

async function nodeToDocx(node: TreeNode, depth: number): Promise<Array<Paragraph | Table>> {
	const items: Array<Paragraph | Table> = [];

	if (node.type === 'section') {
		items.push(new Paragraph({ text: node.label, heading: headingLevel(depth) }));
		for (const child of node.children || []) {
			items.push(...(await nodeToDocx(child, depth + 1)));
		}
	} else if (node.type === 'text_block') {
		const text = node.generated_content || node.content || '';
		if (text) items.push(...textToParagraphs(text));
	} else if (node.type === 'image') {
		const src = node.generated_content || node.imageUrl || '';
		const alt = node.altText || node.label;
		if (src.startsWith('data:image/')) {
			const { data, width, height } = await dataUrlToBuffer(src);
			if (data.byteLength > 0) {
				const maxW = 600;
				const scale = width > maxW ? maxW / width : 1;
				items.push(
					new Paragraph({
						alignment: AlignmentType.CENTER,
						children: [
							new ImageRun({
								data,
								transformation: { width: Math.round(width * scale), height: Math.round(height * scale) },
								type: 'png',
							} as IImageOptions),
						],
					})
				);
			}
		}
		items.push(new Paragraph({ text: `[Image: ${alt}]`, children: [new TextRun({ text: `[Image: ${alt}]`, italics: true, color: '666666' })] }));
	} else if (node.type === 'code') {
		const code = node.generated_content || node.content || '';
		if (code) {
			items.push(new Paragraph({ children: [new TextRun({ text: node.label, bold: true })] }));
			for (const line of code.split('\n')) {
				items.push(
					new Paragraph({
						children: [new TextRun({ text: line || ' ', font: 'Courier New', size: 18 })],
						indent: { left: 720 },
					})
				);
			}
		}
	} else if (node.type === 'equation') {
		const eq = node.generated_content || node.content || '';
		if (eq) {
			items.push(
				new Paragraph({ children: [new TextRun({ text: node.label, bold: true })] }),
				new Paragraph({
					alignment: AlignmentType.CENTER,
					children: [new TextRun({ text: eq, font: 'Courier New', size: 20 })],
				})
			);
		}
	} else if (node.type === 'table') {
		const md = node.generated_content || node.content || '';
		const parsed = md ? parseMarkdownTable(md) : null;
		if (parsed) {
			items.push(new Paragraph({ children: [new TextRun({ text: node.label, bold: true })] }));
			const border = { style: BorderStyle.SINGLE, size: 1, color: 'AAAAAA' };
			const cellBorders = { top: border, bottom: border, left: border, right: border };
			const headerRow = new TableRow({
				children: parsed.headers.map(
					(h) => new TableCell({
						borders: cellBorders,
						shading: { fill: 'F3F4F6' },
						children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
					})
				),
			});
			const dataRows = parsed.rows.map(
				(row) => new TableRow({
					children: parsed.headers.map(
						(_h, i) => new TableCell({
							borders: cellBorders,
							children: [new Paragraph({ children: [new TextRun(row[i] ?? '')] })],
						})
					),
				})
			);
			items.push(new Table({
				width: { size: 100, type: WidthType.PERCENTAGE },
				rows: [headerRow, ...dataRows],
			}));
			items.push(new Paragraph({}));
		} else if (md) {
			items.push(new Paragraph({ children: [new TextRun({ text: node.label, bold: true })] }));
			for (const line of md.split('\n')) {
				items.push(new Paragraph({ children: [new TextRun({ text: line || ' ', font: 'Courier New', size: 18 })], indent: { left: 720 } }));
			}
		}
	}

	return items;
}

export async function downloadDocx(tree: TreeNode[], title: string): Promise<string | null> {
	const children: Array<Paragraph | Table> = [];
	if (title) {
		children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }));
	}
	for (const node of tree) {
		children.push(...(await nodeToDocx(node, title ? 2 : 1)));
	}

	const doc = new Document({
		sections: [{ properties: {}, children }],
	});

	const blob = await Packer.toBlob(doc);
	return triggerDownload(blob, `${sanitize(title || 'document')}.docx`);
}

function sanitize(s: string): string {
	return s.replace(/[^a-z0-9_\-. ]/gi, '_').trim() || 'document';
}

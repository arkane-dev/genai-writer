import JSZip from 'jszip';
import { triggerDownload } from './markdown';
import type { TreeNode } from '$lib/types';

function esc(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const HEADING_STYLES = ['Heading_20_1', 'Heading_20_2', 'Heading_20_3', 'Heading_20_4'];

function headingStyle(depth: number): string {
	return HEADING_STYLES[Math.min(depth - 1, 3)];
}

async function nodeToOdt(node: TreeNode, depth: number, images: Map<string, Uint8Array>): Promise<string> {
	const parts: string[] = [];

	if (node.type === 'section') {
		parts.push(`<text:h text:style-name="${headingStyle(depth)}" text:outline-level="${depth}">${esc(node.label)}</text:h>`);
		for (const child of node.children || []) {
			parts.push(await nodeToOdt(child, depth + 1, images));
		}
	} else if (node.type === 'text_block') {
		const text = node.generated_content || node.content || '';
		for (const block of text.split(/\n\n+/).filter(Boolean)) {
			parts.push(`<text:p text:style-name="Text_20_Body">${esc(block.replace(/\n/g, ' '))}</text:p>`);
		}
	} else if (node.type === 'image') {
		const src = node.generated_content || node.imageUrl || '';
		const alt = node.altText || node.label;
		if (src.startsWith('data:image/')) {
			const filename = `Pictures/${node.id}.png`;
			const base64 = src.split(',')[1];
			const binary = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
			images.set(filename, binary);
			parts.push(
				`<text:p text:style-name="Illustration"><draw:frame draw:name="${esc(alt)}" svg:width="14cm" svg:height="9cm" draw:z-index="0">` +
				`<draw:image xlink:href="${filename}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/>` +
				`</draw:frame></text:p>` +
				`<text:p text:style-name="Illustration_20_Legend">${esc(alt)}</text:p>`
			);
		} else {
			parts.push(`<text:p text:style-name="Text_20_Body"><text:span text:style-name="Emphasis">[Image: ${esc(alt)}]</text:span></text:p>`);
		}
	} else if (node.type === 'code') {
		const code = node.generated_content || node.content || '';
		if (code) {
			parts.push(`<text:p text:style-name="Text_20_Body"><text:span text:style-name="Strong_20_Emphasis">${esc(node.label)}</text:span></text:p>`);
			for (const line of code.split('\n')) {
				parts.push(`<text:p text:style-name="Preformatted_20_Text">${esc(line || ' ')}</text:p>`);
			}
		}
	} else if (node.type === 'equation') {
		const eq = node.generated_content || node.content || '';
		if (eq) {
			parts.push(
				`<text:p text:style-name="Text_20_Body"><text:span text:style-name="Strong_20_Emphasis">${esc(node.label)}</text:span></text:p>`,
				`<text:p text:style-name="Preformatted_20_Text">${esc(eq)}</text:p>`
			);
		}
	} else if (node.type === 'table') {
		const md = node.generated_content || node.content || '';
		if (md) {
			const lines = md.trim().split('\n').map(l => l.trim()).filter(Boolean);
			const parse = (line: string) => line.split('|').slice(1, -1).map(c => c.trim());
			const isSep = (line: string) => /^\|[\s\-:|]+\|$/.test(line);
			const headers = parse(lines[0] ?? '');
			const rows = lines.slice(1).filter(l => l.includes('|') && !isSep(l)).map(parse);
			if (headers.length > 0) {
				parts.push(`<text:p text:style-name="Text_20_Body"><text:span text:style-name="Strong_20_Emphasis">${esc(node.label)}</text:span></text:p>`);
				const colCount = headers.length;
				const cells = (row: string[], style: string) =>
					row.map((_h, i) =>
						`<table:table-cell table:style-name="TableCell"><text:p text:style-name="${style}">${esc(row[i] ?? '')}</text:p></table:table-cell>`
					).join('');
				parts.push(
					`<table:table table:name="${esc(node.id)}" table:style-name="Table1">`,
					`<table:table-column table:number-columns-repeated="${colCount}"/>`,
					`<table:table-header-rows><table:table-row>${cells(headers, 'Table_20_Heading')}</table:table-row></table:table-header-rows>`,
					...rows.map(row => `<table:table-row>${cells(row, 'Table_20_Contents')}</table:table-row>`),
					`</table:table>`
				);
			}
		}
	}

	return parts.join('\n');
}

export async function downloadOdt(tree: TreeNode[], title: string): Promise<void> {
	const images = new Map<string, Uint8Array>();
	const contentParts: string[] = [];

	if (title) {
		contentParts.push(`<text:h text:style-name="Title" text:outline-level="1">${esc(title)}</text:h>`);
	}
	for (const node of tree) {
		contentParts.push(await nodeToOdt(node, title ? 2 : 1, images));
	}

	const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"
  xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"
  xmlns:xlink="http://www.w3.org/1999/xlink"
  office:version="1.3">
<office:automatic-styles/>
<office:body>
<office:text>
${contentParts.join('\n')}
</office:text>
</office:body>
</office:document-content>`;

	const manifestEntries: string[] = [
		'<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>',
		'<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>',
		'<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>',
	];
	for (const [path] of images) {
		manifestEntries.push(`<manifest:file-entry manifest:full-path="${path}" manifest:media-type="image/png"/>`);
	}

	const manifestXml = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0">
${manifestEntries.join('\n')}
</manifest:manifest>`;

	const stylesXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  office:version="1.3">
<office:styles>
  <style:default-style style:family="paragraph">
    <style:text-properties fo:font-size="12pt" style:font-name="Liberation Serif"/>
  </style:default-style>
</office:styles>
</office:document-styles>`;

	const mimetypeContent = 'application/vnd.oasis.opendocument.text';

	const zip = new JSZip();
	zip.file('mimetype', mimetypeContent, { compression: 'STORE' });
	zip.file('content.xml', contentXml);
	zip.file('styles.xml', stylesXml);
	zip.file('META-INF/manifest.xml', manifestXml);
	for (const [path, data] of images) {
		zip.file(path, data);
	}

	const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.oasis.opendocument.text' });
	triggerDownload(blob, `${sanitize(title || 'document')}.odt`);
}

function sanitize(s: string): string {
	return s.replace(/[^a-z0-9_\-. ]/gi, '_').trim() || 'document';
}

import { renderToString } from 'katex';
import type { TreeNode } from '$lib/types';
import { netFetch } from '$lib/platform/net';
import { saveFile } from '$lib/platform/save';

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function srcToDataUrl(src: string): Promise<string> {
	if (!src) return '';
	if (src.startsWith('data:')) return src;
	try {
		const res = await netFetch(src);
		const blob = await res.blob();
		return await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = reject;
			reader.readAsDataURL(blob);
		});
	} catch {
		return src;
	}
}

async function nodeToHtml(node: TreeNode, depth: number): Promise<string> {
	const hLevel = Math.min(depth, 6);
	const parts: string[] = [];

	if (node.type === 'section') {
		parts.push(`<h${hLevel}>${escapeHtml(node.label)}</h${hLevel}>`);
		for (const child of node.children ?? []) {
			parts.push(await nodeToHtml(child, depth + 1));
		}
	} else if (node.type === 'text_block') {
		const text = node.generated_content || node.content || '';
		for (const p of text.split(/\n\n+/).filter(Boolean)) {
			parts.push(`<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`);
		}
	} else if (node.type === 'image') {
		const alt = node.altText || node.label;
		const rawSrc = node.generated_content || node.imageUrl || '';
		const src = await srcToDataUrl(rawSrc);
		parts.push('<figure>');
		if (src) {
			parts.push(`<img src="${src}" alt="${escapeHtml(alt)}" style="max-width:100%">`);
		} else {
			parts.push(`<div class="image-placeholder">[Image: ${escapeHtml(alt)}]</div>`);
		}
		if (alt) parts.push(`<figcaption>${escapeHtml(alt)}</figcaption>`);
		parts.push('</figure>');
	} else if (node.type === 'code') {
		const code = node.generated_content || node.content || '';
		parts.push('<figure class="code-block">');
		parts.push(`<figcaption>${escapeHtml(node.label)}</figcaption>`);
		if (code) parts.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
		parts.push('</figure>');
	} else if (node.type === 'table') {
		const md = node.generated_content || node.content || '';
		if (md) {
			const lines = md.trim().split('\n').map((l) => l.trim()).filter(Boolean);
			const parse = (line: string) => line.split('|').slice(1, -1).map((c) => c.trim());
			const isSep = (line: string) => /^\|[\s\-:|]+\|$/.test(line);
			const headers = parse(lines[0] ?? '');
			const rows = lines.slice(1).filter((l) => l.includes('|') && !isSep(l)).map(parse);
			if (headers.length > 0) {
				parts.push('<figure class="table-block">');
				parts.push(`<figcaption>${escapeHtml(node.label)}</figcaption>`);
				parts.push('<table>');
				parts.push('<thead><tr>' + headers.map((h) => `<th>${escapeHtml(h)}</th>`).join('') + '</tr></thead>');
				parts.push('<tbody>');
				for (const row of rows) {
					parts.push('<tr>' + headers.map((_h, i) => `<td>${escapeHtml(row[i] ?? '')}</td>`).join('') + '</tr>');
				}
				parts.push('</tbody></table>');
				parts.push('</figure>');
			}
		}
	} else if (node.type === 'equation') {
		const eq = node.generated_content || node.content || '';
		parts.push('<figure class="equation">');
		parts.push(`<figcaption>${escapeHtml(node.label)}</figcaption>`);
		if (eq) {
			try {
				parts.push(`<div class="eq">${renderToString(eq, { displayMode: true, throwOnError: false })}</div>`);
			} catch {
				parts.push(`<pre>$$${escapeHtml(eq)}$$</pre>`);
			}
		}
		parts.push('</figure>');
	}

	return parts.join('\n');
}

async function inlineKatexCss(): Promise<string> {
	const href = Array.from(document.styleSheets)
		.map((s) => { try { return s.href; } catch { return null; } })
		.find((h) => h?.includes('katex'));
	if (!href) return '';
	try {
		const res = await netFetch(href);
		return await res.text();
	} catch {
		return '';
	}
}

const STYLES = `
  body{font-family:Georgia,serif;max-width:800px;margin:40px auto;padding:0 20px;color:#111;line-height:1.6}
  h1,h2,h3,h4,h5,h6{font-family:system-ui,sans-serif;margin-top:1.5em}
  pre{background:#f5f5f5;padding:1em;overflow:auto;border-radius:4px;font-size:.9em}
  code{font-family:monospace}
  figure{margin:1.5em 0}
  figcaption{font-style:italic;color:#555;font-size:.9em;margin-bottom:.5em}
  .image-placeholder{border:1px dashed #aaa;padding:2em;text-align:center;color:#777}
  img{display:block;max-width:100%}
  .eq{text-align:center;margin:1em 0;overflow-x:auto}
  table{border-collapse:collapse;width:100%;margin:.5em 0}
  th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}
  th{background:#f3f4f6;font-weight:600}
  tr:nth-child(even){background:#fafafa}
`;

export async function downloadHtml(tree: TreeNode[], title: string): Promise<string | null> {
	const katexCss = await inlineKatexCss();

	const bodyParts: string[] = [];
	if (title) bodyParts.push(`<h1>${escapeHtml(title)}</h1>`);
	for (const node of tree) {
		bodyParts.push(await nodeToHtml(node, title ? 2 : 1));
	}

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title || 'Document')}</title>
<style>${STYLES}${katexCss}</style>
</head>
<body>
${bodyParts.join('\n')}
</body>
</html>`;

	const blob = new Blob([html], { type: 'text/html' });
	return saveFile(blob, `${title || 'document'}.html`);
}

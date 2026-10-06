import { renderToString } from 'katex';
import type { TreeNode } from '$lib/types';

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function nodeToHtml(node: TreeNode, depth: number): string {
	const hLevel = Math.min(depth, 6);
	const parts: string[] = [];

	if (node.type === 'section') {
		parts.push(`<h${hLevel}>${escapeHtml(node.label)}</h${hLevel}>`);
		for (const child of node.children || []) {
			parts.push(nodeToHtml(child, depth + 1));
		}
	} else if (node.type === 'text_block') {
		const text = node.generated_content || node.content || '';
		if (text) {
			const paragraphs = text.split(/\n\n+/);
			for (const p of paragraphs) {
				parts.push(`<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`);
			}
		}
	} else if (node.type === 'image') {
		const alt = node.altText || node.label;
		const src = node.generated_content || node.imageUrl || '';
		parts.push(`<figure>`);
		if (src) {
			parts.push(`<img src="${src}" alt="${escapeHtml(alt)}" style="max-width:100%">`);
		} else {
			parts.push(`<div class="image-placeholder">[Image: ${escapeHtml(alt)}]</div>`);
		}
		parts.push(`<figcaption>${escapeHtml(alt)}</figcaption>`);
		parts.push(`</figure>`);
	} else if (node.type === 'code') {
		const code = node.generated_content || node.content || '';
		parts.push(`<figure class="code-block">`);
		parts.push(`<figcaption>${escapeHtml(node.label)}</figcaption>`);
		if (code) parts.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
		parts.push(`</figure>`);
	} else if (node.type === 'table') {
		const md = node.generated_content || node.content || '';
		if (md) {
			const lines = md.trim().split('\n').map(l => l.trim()).filter(Boolean);
			const parse = (line: string) => line.split('|').slice(1, -1).map(c => c.trim());
			const isSep = (line: string) => /^\|[\s\-:|]+\|$/.test(line);
			const headers = parse(lines[0] ?? '');
			const rows = lines.slice(1).filter(l => l.includes('|') && !isSep(l)).map(parse);
			if (headers.length > 0) {
				parts.push(`<figure class="table-block">`);
				parts.push(`<figcaption>${escapeHtml(node.label)}</figcaption>`);
				parts.push('<table>');
				parts.push('<thead><tr>' + headers.map(h => `<th>${escapeHtml(h)}</th>`).join('') + '</tr></thead>');
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
		parts.push(`<figure class="equation">`);
		parts.push(`<figcaption>${escapeHtml(node.label)}</figcaption>`);
		if (eq) {
			try {
				parts.push(`<div class="eq">${renderToString(eq, { displayMode: true, throwOnError: false })}</div>`);
			} catch {
				parts.push(`<pre>$$${escapeHtml(eq)}$$</pre>`);
			}
		}
		parts.push(`</figure>`);
	}

	return parts.join('\n');
}

export function printAsPdf(tree: TreeNode[], title: string): void {
	const bodyParts: string[] = [];
	if (title) bodyParts.push(`<h1>${escapeHtml(title)}</h1>`);
	for (const node of tree) {
		bodyParts.push(nodeToHtml(node, title ? 2 : 1));
	}

	const katexCss = Array.from(document.styleSheets)
		.filter((s) => {
			try { return s.href?.includes('katex'); }
			catch { return false; }
		})
		.map((s) => s.href)
		.filter(Boolean)
		.map((href) => `<link rel="stylesheet" href="${href}">`)
		.join('\n');

	const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title || 'Document')}</title>
${katexCss}
<style>
  body { font-family: Georgia, serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #111; line-height: 1.6; }
  h1,h2,h3,h4,h5,h6 { font-family: system-ui, sans-serif; margin-top: 1.5em; }
  pre { background: #f5f5f5; padding: 1em; overflow: auto; border-radius: 4px; font-size: 0.9em; }
  code { font-family: monospace; }
  figure { margin: 1.5em 0; }
  figcaption { font-style: italic; color: #555; font-size: 0.9em; margin-bottom: 0.5em; }
  .image-placeholder { border: 1px dashed #aaa; padding: 2em; text-align: center; color: #777; }
  img { display: block; }
  .eq { text-align: center; margin: 1em 0; overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
  th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
  th { background: #f3f4f6; font-weight: 600; }
  tr:nth-child(even) { background: #fafafa; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
${bodyParts.join('\n')}
<script>window.onload = function(){ window.print(); }<\/script>
</body>
</html>`;

	const w = window.open('', '_blank');
	if (!w) {
		alert('Pop-up blocked. Please allow pop-ups for this page to use PDF export.');
		return;
	}
	w.document.open();
	w.document.write(html);
	w.document.close();
}

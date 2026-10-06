<script lang="ts">
	import type { TreeNode } from '$lib/types';
	import { renderToString } from 'katex';
	import 'katex/dist/katex.min.css';

	interface Props {
		tree: TreeNode[];
		documentTitle?: string;
		isGenerating?: boolean;
		onNodeUpdate: (nodeId: string, field: 'generated_content' | 'content', value: string) => void;
	}

	let { tree, documentTitle = '', isGenerating = false, onNodeUpdate }: Props = $props();

	function parseMarkdownTable(md: string): { headers: string[]; rows: string[][] } | null {
		const lines = md.trim().split('\n').map(l => l.trim()).filter(Boolean);
		if (lines.length < 2 || !lines[0].includes('|')) return null;
		const parse = (line: string) => line.split('|').slice(1, -1).map(c => c.trim());
		const isSep = (line: string) => /^\|[\s\-:|]+\|$/.test(line);
		const headers = parse(lines[0]);
		const rows = lines.slice(1).filter(l => l.includes('|') && !isSep(l)).map(parse);
		return headers.length ? { headers, rows } : null;
	}

	function renderEquation(latex: string): string {
		if (!latex.trim()) return '';
		try {
			return renderToString(latex.trim(), { displayMode: true, throwOnError: false });
		} catch {
			return `<code>${latex}</code>`;
		}
	}

	function effectiveContent(node: TreeNode): string {
		return node.generated_content ?? node.content ?? '';
	}

	function editField(node: TreeNode): 'generated_content' | 'content' {
		return node.generated_content !== null ? 'generated_content' : 'content';
	}

	function handleTextBlur(node: TreeNode, el: HTMLElement) {
		if (isGenerating) return;
		// innerText preserves manual line breaks the user typed.
		const value = el.innerText;
		const field = editField(node);
		const current = String(node[field] ?? '');
		if (value !== current) {
			onNodeUpdate(node.id, field, value);
		}
	}
</script>

{#snippet renderNode(node: TreeNode, depth: number)}
	{#if node.type === 'section'}
		{@render renderSection(node, depth)}
	{:else}
		{@render renderContent(node)}
	{/if}
{/snippet}

{#snippet renderSection(node: TreeNode, depth: number)}
	<div class="sec d{Math.min(depth, 3)}">
		<svelte:element this={'h' + Math.min(depth + 2, 6)}>{node.label}</svelte:element>
		{#each node.children as child (child.id)}
			{@render renderNode(child, depth + 1)}
		{/each}
	</div>
{/snippet}

{#snippet renderContent(node: TreeNode)}
	{@const text = effectiveContent(node)}
	{@const canEdit = !isGenerating}

	<div class="block">
		{#if node.type === 'text_block'}
			{#if text}
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<div
					role="textbox"
					aria-multiline="true"
					aria-label="{node.label} text"
					contenteditable={canEdit}
					spellcheck="true"
					class="para"
					class:editable={canEdit}
					onblur={(e) => handleTextBlur(node, e.currentTarget as HTMLElement)}
				>{text}</div>
			{:else if node.generate && !isGenerating}
				<p class="hint">Not generated yet. Press Generate in the toolbar.</p>
			{:else if canEdit}
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<div
					role="textbox"
					aria-multiline="true"
					aria-label="{node.label} text"
					contenteditable="true"
					spellcheck="true"
					class="para editable empty"
					data-placeholder="Empty. Click to write."
					onblur={(e) => handleTextBlur(node, e.currentTarget as HTMLElement)}
				></div>
			{/if}

		{:else if node.type === 'image'}
			{#if node.imageUrl}
				<figure>
					<img src={node.imageUrl} alt={node.altText || node.label} />
					{#if node.altText}<figcaption>{node.altText}</figcaption>{/if}
				</figure>
			{:else if text}
				<p class="hint boxed">[Image: {text}]</p>
			{/if}

		{:else if node.type === 'code'}
			{#if text}<pre><code>{text}</code></pre>{/if}

		{:else if node.type === 'equation'}
			{#if text}<div class="eq">{@html renderEquation(text)}</div>{/if}

		{:else if node.type === 'table'}
			{#if text}
				{@const parsed = parseMarkdownTable(text)}
				{#if parsed}
					<div class="table-wrap">
						<table>
							<thead>
								<tr>{#each parsed.headers as h, hi (hi)}<th>{h}</th>{/each}</tr>
							</thead>
							<tbody>
								{#each parsed.rows as row, ri (ri)}
									<tr>{#each parsed.headers as _h, i (i)}<td>{row[i] ?? ''}</td>{/each}</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<pre><code>{text}</code></pre>
				{/if}
			{/if}
		{/if}
	</div>
{/snippet}

<article class="doc nd-paper">
	{#if documentTitle}<h1>{documentTitle}</h1>{/if}
	{#if tree.length === 0}
		<p class="hint">Add sections to the tree to see the preview.</p>
	{:else}
		{#each tree as node (node.id)}
			{@render renderNode(node, 0)}
		{/each}
	{/if}
</article>

<style>
	/* The document on paper (NEONDECK editorial mode). Headings keep the author's case. */
	.doc { padding: var(--nd-space-8) var(--nd-space-8) var(--nd-space-10); font-size: var(--nd-text-md); line-height: 1.6; }
	.doc :global(h1), .doc :global(h2), .doc :global(h3), .doc :global(h4), .doc :global(h5), .doc :global(h6) { text-transform: none; letter-spacing: 0; }
	h1 { margin-bottom: var(--nd-space-6); padding-bottom: var(--nd-space-3); border-bottom: 2px solid var(--nd-ink); font-size: var(--nd-text-3xl); }
	.sec { margin-top: var(--nd-space-6); }
	.sec:first-child { margin-top: 0; }
	.d0 > :global(h2) { padding-bottom: var(--nd-space-1); border-bottom: 1px solid var(--nd-line); font-size: var(--nd-text-xl); }
	.d1 > :global(h3) { font-size: var(--nd-text-lg); }
	.d2 > :global(h4), .d3 > :global(*:first-child) { font-size: var(--nd-text-md); }
	.block { margin-bottom: var(--nd-space-3); }
	.para { margin: 0 calc(var(--nd-space-2) * -1); padding: var(--nd-space-1) var(--nd-space-2); white-space: pre-wrap; outline: none; }
	.para.editable { cursor: text; }
	.para.editable:hover { background: color-mix(in srgb, var(--nd-ink) 5%, transparent); }
	.para.editable:focus { background: color-mix(in srgb, var(--nd-ink) 4%, transparent); outline: 1px solid var(--nd-ink); }
	.para.empty { min-height: 2rem; }
	.para[data-placeholder]:empty::before { content: attr(data-placeholder); color: var(--nd-text-mute); pointer-events: none; }
	.hint { color: var(--nd-text-mute); font-size: var(--nd-text-sm); }
	.hint.boxed { padding: var(--nd-space-2); border: 1px solid var(--nd-line); }
	figure { margin: var(--nd-space-4) 0; }
	figure img { max-width: 100%; border: 1px solid var(--nd-line); }
	figcaption { margin-top: var(--nd-space-1); color: var(--nd-text-mute); font-size: var(--nd-text-xs); text-align: center; }
	/* Code on paper: ink block, cream text (the dark-mode pre colours would vanish here). */
	pre { background: var(--nd-ink); color: var(--nd-paper); border-left-color: var(--nd-cinnabar); }
	.eq { overflow-x: auto; padding: var(--nd-space-1) 0; text-align: center; }
	.table-wrap { overflow-x: auto; margin: var(--nd-space-3) 0; }
	table { width: 100%; border-collapse: collapse; font-size: var(--nd-text-sm); }
	th, td { padding: var(--nd-space-1) var(--nd-space-3); border: 1px solid var(--nd-line); text-align: left; }
	th { border-bottom-color: var(--nd-ink); font-weight: 700; }
</style>

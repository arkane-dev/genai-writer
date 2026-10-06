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

<!-- ── Render snippets ─────────────────────────────────────────────────────── -->

{#snippet renderNode(node: TreeNode, depth: number)}
	{#if node.type === 'section'}
		{@render renderSection(node, depth)}
	{:else}
		{@render renderContent(node)}
	{/if}
{/snippet}

{#snippet renderSection(node: TreeNode, depth: number)}
	<div class="mt-7 first:mt-0">
		<svelte:element
			this={"h" + Math.min(depth + 2, 6)}
			class="font-bold text-surface-900 mb-3
				{depth === 0 ? 'text-xl border-b border-surface-200 pb-1.5' :
				 depth === 1 ? 'text-lg' :
				 depth === 2 ? 'text-base' : 'text-sm'}"
		>{node.label}</svelte:element>

		{#each node.children as child (child.id)}
			{@render renderNode(child, depth + 1)}
		{/each}
	</div>
{/snippet}

{#snippet renderContent(node: TreeNode)}
	{@const text = effectiveContent(node)}
	{@const canEdit = !isGenerating}

	<div class="mb-3">
		{#if node.type === 'text_block'}
			{#if text}
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<div
					role="textbox"
					aria-multiline="true"
					contenteditable={canEdit}
					spellcheck="true"
					class="leading-relaxed text-surface-800 outline-none rounded px-1.5 py-0.5 -mx-1.5
						{canEdit ? 'hover:bg-primary-50/60 focus:bg-white focus:ring-1 focus:ring-primary-300 cursor-text' : 'cursor-default'}
						whitespace-pre-wrap"
					onblur={(e) => handleTextBlur(node, e.currentTarget as HTMLElement)}
				>{text}</div>
			{:else if node.generate && !isGenerating}
				<p class="text-xs text-surface-300 italic px-1.5">Not generated yet — click Generate in the toolbar.</p>
			{:else if canEdit}
				<!-- svelte-ignore a11y_interactive_supports_focus -->
				<div
					role="textbox"
					aria-multiline="true"
					contenteditable="true"
					spellcheck="true"
					class="leading-relaxed text-surface-800 outline-none rounded px-1.5 py-0.5 -mx-1.5
						hover:bg-primary-50/60 focus:bg-white focus:ring-1 focus:ring-primary-300 cursor-text
						whitespace-pre-wrap min-h-[2rem]"
					data-placeholder="Empty — click to write…"
					onblur={(e) => handleTextBlur(node, e.currentTarget as HTMLElement)}
				></div>
			{/if}

		{:else if node.type === 'image'}
			{#if node.imageUrl}
				<figure class="my-3">
					<img src={node.imageUrl} alt={node.altText || node.label} class="max-w-full rounded-lg shadow-sm" />
					{#if node.altText}
						<figcaption class="text-xs text-center text-surface-400 mt-1 italic">{node.altText}</figcaption>
					{/if}
				</figure>
			{:else if text}
				<p class="text-sm text-surface-500 italic border border-dashed border-surface-200 rounded p-2">[Image: {text}]</p>
			{/if}

		{:else if node.type === 'code'}
			{#if text}
				<pre class="bg-surface-900 text-surface-50 p-3 rounded-lg overflow-x-auto my-2 text-sm font-mono leading-relaxed"><code>{text}</code></pre>
			{/if}

		{:else if node.type === 'equation'}
			{#if text}
				<div class="my-3 py-1 text-center overflow-x-auto">
					{@html renderEquation(text)}
				</div>
			{/if}

		{:else if node.type === 'table'}
			{#if text}
				{@const parsed = parseMarkdownTable(text)}
				{#if parsed}
					<div class="my-3 overflow-x-auto">
						<table class="w-full text-sm border-collapse">
							<thead>
								<tr class="bg-surface-100">
									{#each parsed.headers as h}
										<th class="border border-surface-300 px-3 py-1.5 text-left font-semibold text-surface-800">{h}</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each parsed.rows as row, ri}
									<tr class={ri % 2 === 1 ? 'bg-surface-50' : ''}>
										{#each parsed.headers as _h, i}
											<td class="border border-surface-200 px-3 py-1.5 text-surface-700">{row[i] ?? ''}</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<pre class="text-sm font-mono whitespace-pre-wrap text-surface-700">{text}</pre>
				{/if}
			{/if}
		{/if}
	</div>
{/snippet}

<!-- ── Document ────────────────────────────────────────────────────────────── -->

<div class="text-[15px] font-['Georgia',serif]">
	{#if documentTitle}
		<h1 class="text-2xl font-bold text-surface-900 mb-6 pb-2 border-b-2 border-surface-200">{documentTitle}</h1>
	{/if}

	{#if tree.length === 0}
		<p class="text-surface-400 text-sm italic">Add sections to the tree to see a preview here.</p>
	{:else}
		{#each tree as node (node.id)}
			{@render renderNode(node, 0)}
		{/each}
	{/if}
</div>

<style>
	[contenteditable][data-placeholder]:empty::before {
		content: attr(data-placeholder);
		color: #c4c4c4;
		pointer-events: none;
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { generationState } from '$lib/generationState.svelte';
	import { generateDocument, generateSpecialSections } from '$lib/generation';
	import { store } from '$lib/platform/store.svelte';
	import { serializeTree } from '$lib/history';
	import ExportModal from '$lib/ExportModal.svelte';
	import { Button, Tag } from '@cyberpunk-apps/neondeck';
	import type { TreeNode } from '$lib/types';
	import katex from 'katex';
	import 'katex/dist/katex.min.css';

	let showExport = $state(false);
	let doCancel: (() => void) | null = $state(null);
	let showLog = $state(false);

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
			return katex.renderToString(latex.trim(), { displayMode: true, throwOnError: false });
		} catch {
			return `<code>${latex}</code>`;
		}
	}

	onMount(() => {
		if (generationState.status !== 'generating') {
			goto('#/');
			return;
		}

		const abortController = new AbortController();
		doCancel = () => abortController.abort();
		const signal = abortController.signal;

		(async () => {
			try {
				const uidRef = { current: generationState.uidCurrent };
				const genOptions = {
					signal,
					onNodeStart: (node: TreeNode) => {
						if (generationState.currentNodeLabel) {
							generationState.completedNodes = [...generationState.completedNodes, generationState.currentNodeLabel];
						}
						generationState.currentNodeId = node.id;
						generationState.currentNodeLabel = node.label;
					},
				};

				await generateDocument(generationState.tree, uidRef, genOptions);
				await generateSpecialSections(
					generationState.tree,
					generationState.documentOptions,
					generationState.documentTitle,
					uidRef,
					genOptions,
				);

				generationState.uidCurrent = uidRef.current;
				if (generationState.currentNodeLabel) {
					generationState.completedNodes = [...generationState.completedNodes, generationState.currentNodeLabel];
				}
				generationState.currentNodeId = null;
				generationState.currentNodeLabel = '';

				if (generationState.documentId !== null) {
					const serialized = serializeTree(generationState.tree);
					await store.addSnapshot({
						documentId: generationState.documentId,
						timestamp: Date.now(),
						message: 'Generated document',
						tree: JSON.stringify(serialized),
					});
				}

				generationState.status = 'done';
			} catch (err) {
				if (signal.aborted) {
					generationState.status = 'idle';
					return;
				}
				generationState.error = String(err);
				generationState.status = 'error';
			}
		})();

		return () => {
			abortController.abort();
			doCancel = null;
		};
	});
</script>

<svelte:head>
	<title>{generationState.documentTitle || 'Preview'} · GenAI Writer</title>
</svelte:head>

<div class="hud">
	<div class="bar">
		<Button variant="ghost" onclick={() => goto('#/')}>← Editor</Button>

		<div class="state" role="status">
			{#if generationState.status === 'generating'}
				<span class="nd-mono live">&gt; GENERATING{generationState.currentNodeLabel ? `: ${generationState.currentNodeLabel}` : ''}<span class="nd-cursor"></span></span>
			{:else if generationState.status === 'done'}
				<Tag tone="success" dot>done · {generationState.completedNodes.length} node{generationState.completedNodes.length === 1 ? '' : 's'}</Tag>
			{:else if generationState.status === 'error'}
				<Tag tone="danger" dot>{generationState.error ?? 'generation failed'}</Tag>
			{/if}
		</div>

		{#if generationState.completedNodes.length > 0 || generationState.status === 'generating'}
			<Button variant="ghost" onclick={() => { showLog = !showLog; }} aria-expanded={showLog}>
				Log {generationState.completedNodes.length}{generationState.status === 'generating' ? '+1' : ''} {showLog ? '▴' : '▾'}
			</Button>
		{/if}
		{#if generationState.status === 'generating' && doCancel}
			<Button variant="outline" accent="red" onclick={doCancel}>Stop</Button>
		{/if}
		<Button variant="outline" onclick={() => (showExport = true)}>Export</Button>
	</div>

	{#if showLog}
		<ol class="log">
			{#each generationState.completedNodes as label, i (i)}
				<li><span class="ok">[ok]</span> {String(i + 1).padStart(2, '0')} {label}</li>
			{/each}
			{#if generationState.status === 'generating' && generationState.currentNodeLabel}
				<li class="now"><span>[..]</span> {String(generationState.completedNodes.length + 1).padStart(2, '0')} {generationState.currentNodeLabel}</li>
			{/if}
		</ol>
	{/if}
</div>

<article class="doc nd-paper">
	{#if generationState.documentTitle}<h1>{generationState.documentTitle}</h1>{/if}
	{#if generationState.tree.length === 0}
		<p class="hint">No content to show.</p>
	{:else}
		{#each generationState.tree as node (node.id)}
			{@render renderNode(node, 0)}
		{/each}
	{/if}
</article>

{#if showExport}
	<ExportModal tree={generationState.tree} documentTitle={generationState.documentTitle} onClose={() => (showExport = false)} />
{/if}

{#snippet renderNode(node: TreeNode, depth: number)}
	{#if node.type === 'section'}
		{@render renderSection(node, depth)}
	{:else}
		{@render renderContent(node)}
	{/if}
{/snippet}

{#snippet renderSection(node: TreeNode, depth: number)}
	<div class="sec d{Math.min(depth, 3)}">
		<svelte:element this={'h' + Math.min(depth + 2, 5)}>{node.label}</svelte:element>
		{#each node.children as child (child.id)}
			{@render renderNode(child, depth + 1)}
		{/each}
	</div>
{/snippet}

{#snippet cursor()}<span class="nd-cursor" aria-hidden="true"></span>{/snippet}

{#snippet renderContent(node: TreeNode)}
	{@const isActive = generationState.currentNodeId === node.id}
	{@const queued = node.generate && generationState.status === 'generating'}
	<div class="block">
		{#if node.type === 'text_block'}
			{#if node.generated_content !== null}
				{@const paras = node.generated_content.split('\n\n').filter(Boolean)}
				{#each paras as para, i (i)}
					<p>{para}{#if isActive && i === paras.length - 1}{@render cursor()}{/if}</p>
				{/each}
				{#if paras.length === 0 && isActive}<p>{@render cursor()}</p>{/if}
			{:else if queued}
				<div class="wait nd-hatch" style:height="4.5rem"><span>queued</span></div>
			{:else if node.content}
				{#each node.content.split('\n\n').filter(Boolean) as para, i (i)}<p>{para}</p>{/each}
			{/if}

		{:else if node.type === 'code'}
			<pre><code>{node.generated_content ?? node.content ?? ''}{#if isActive}{@render cursor()}{/if}</code></pre>

		{:else if node.type === 'image'}
			{#if node.imageUrl}
				<figure>
					<img src={node.imageUrl} alt={node.altText || node.label} />
					{#if node.altText}<figcaption>{node.altText}</figcaption>{/if}
				</figure>
			{:else if isActive}
				<div class="wait nd-hatch" style:height="10rem"><span>rendering image{@render cursor()}</span></div>
			{:else if queued}
				<div class="wait nd-hatch" style:height="10rem"><span>image queued</span></div>
			{/if}

		{:else if node.type === 'equation'}
			<div class="eq">
				{#if node.generated_content}
					{@html renderEquation(node.generated_content)}
				{:else if isActive}
					{@render cursor()}
				{:else if queued}
					<div class="wait nd-hatch" style:height="2.5rem"><span>queued</span></div>
				{/if}
			</div>

		{:else if node.type === 'table'}
			<div class="table-wrap">
				{#if node.generated_content}
					{@const parsed = parseMarkdownTable(node.generated_content)}
					{#if parsed}
						<table>
							<thead><tr>{#each parsed.headers as h, hi (hi)}<th>{h}</th>{/each}</tr></thead>
							<tbody>
								{#each parsed.rows as row, ri (ri)}
									<tr>{#each parsed.headers as _h, i (i)}<td>{row[i] ?? ''}</td>{/each}</tr>
								{/each}
							</tbody>
						</table>
						{#if isActive}{@render cursor()}{/if}
					{:else}
						<pre><code>{node.generated_content}{#if isActive}{@render cursor()}{/if}</code></pre>
					{/if}
				{:else if queued}
					<div class="wait nd-hatch" style:height="6rem"><span>{isActive ? 'building table' : 'queued'}</span></div>
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

<style>
	.hud { position: sticky; top: var(--nd-topbar-h); z-index: 10; margin: calc(var(--nd-space-6) * -1) 0 var(--nd-space-6); padding-top: var(--nd-space-3); background: var(--nd-bg); border-bottom: 1px solid var(--nd-line); }
	.bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--nd-space-2); padding-bottom: var(--nd-space-3); }
	.state { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
	.live { color: var(--nd-accent-2); font-size: var(--nd-text-sm); }
	.log { max-height: 10rem; margin: 0; padding: var(--nd-space-2) 0 var(--nd-space-3); overflow-y: auto; list-style: none; border-top: 1px solid var(--nd-line); font-family: var(--nd-font-mono); font-size: var(--nd-text-xs); color: var(--nd-text-dim); }
	.log .ok { color: var(--nd-success); }
	.log .now { color: var(--nd-accent-2); }

	/* Same paper document as the inline preview. Headings keep the author's case. */
	.doc { max-width: 52rem; margin: 0 auto var(--nd-space-12); padding: var(--nd-space-10) var(--nd-space-10) var(--nd-space-12); font-size: var(--nd-text-md); line-height: 1.65; }
	.doc :global(h1), .doc :global(h2), .doc :global(h3), .doc :global(h4), .doc :global(h5) { text-transform: none; letter-spacing: 0; }
	h1 { margin-bottom: var(--nd-space-8); padding-bottom: var(--nd-space-3); border-bottom: 2px solid var(--nd-ink); font-size: var(--nd-text-4xl); }
	.sec { margin-top: var(--nd-space-8); }
	.sec:first-child { margin-top: 0; }
	.d0 > :global(h2) { padding-bottom: var(--nd-space-1); border-bottom: 1px solid var(--nd-line); font-size: var(--nd-text-2xl); }
	.d1 > :global(h3) { font-size: var(--nd-text-xl); }
	.d2 > :global(h4) { font-size: var(--nd-text-lg); }
	.block { margin-bottom: var(--nd-space-4); }
	.block p { max-width: none; }
	pre { background: var(--nd-ink); color: var(--nd-paper); border-left-color: var(--nd-cinnabar); }
	figure { margin: var(--nd-space-4) 0; }
	figure img { max-width: 100%; border: 1px solid var(--nd-line); }
	figcaption { margin-top: var(--nd-space-2); color: var(--nd-text-mute); font-size: var(--nd-text-sm); text-align: center; }
	.eq { overflow-x: auto; padding: var(--nd-space-2) 0; text-align: center; }
	.table-wrap { overflow-x: auto; }
	table { width: 100%; border-collapse: collapse; font-size: var(--nd-text-sm); }
	th, td { padding: var(--nd-space-2) var(--nd-space-3); border: 1px solid var(--nd-line); text-align: left; }
	th { border-bottom-color: var(--nd-ink); font-weight: 700; }
	.hint { color: var(--nd-text-mute); }
	.wait { display: grid; place-items: center; border: 1px solid var(--nd-line); }
	.wait span { font-family: var(--nd-font-mono); font-size: var(--nd-text-xs); color: var(--nd-text-mute); text-transform: uppercase; }
</style>

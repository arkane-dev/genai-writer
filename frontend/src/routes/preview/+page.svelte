<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { generationState } from '$lib/generationState.svelte';
	import { generateDocument, generateSpecialSections } from '$lib/generation';
	import { store } from '$lib/platform/store.svelte';
	import { serializeTree } from '$lib/history';
	import ExportModal from '$lib/ExportModal.svelte';
	import {
		ArrowLeftIcon,
		DownloadIcon,
		SparklesIcon,
		CheckCircle2Icon,
		AlertCircleIcon,
		SquareIcon,
		Loader2Icon,
		ChevronDownIcon,
	} from '@lucide/svelte';
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
	<title>{generationState.documentTitle || 'Preview'} — AI Writer</title>
</svelte:head>

<!-- Sticky toolbar -->
<div class="sticky top-0 z-10 mb-8 bg-surface-50/95 backdrop-blur -mx-4 px-4">
	<div class="flex items-center gap-3 pb-4 border-b border-surface-200">
		<button
			onclick={() => goto('#/')}
			class="btn preset-outlined flex items-center gap-1.5"
		>
			<ArrowLeftIcon class="size-4" /> Editor
		</button>

		<div class="flex-1 min-w-0">
			{#if generationState.status === 'generating'}
				<span class="text-sm text-surface-500 flex items-center gap-1.5 truncate">
					<SparklesIcon class="size-3.5 shrink-0 animate-pulse text-secondary-500" />
					{generationState.currentNodeLabel
						? `Generating: ${generationState.currentNodeLabel}`
						: 'Generating…'}
				</span>
			{:else if generationState.status === 'done'}
				<span class="text-sm text-success-600 flex items-center gap-1.5">
					<CheckCircle2Icon class="size-3.5 shrink-0" /> Done — {generationState.completedNodes.length} node{generationState.completedNodes.length === 1 ? '' : 's'} generated
				</span>
			{:else if generationState.status === 'error'}
				<span class="text-sm text-error-600 flex items-center gap-1.5 truncate">
					<AlertCircleIcon class="size-3.5 shrink-0" />
					{generationState.error ?? 'Generation failed'}
				</span>
			{/if}
		</div>

		<!-- Progress log toggle -->
		{#if generationState.completedNodes.length > 0 || generationState.status === 'generating'}
			<button
				onclick={() => { showLog = !showLog; }}
				class="btn preset-outlined flex items-center gap-1.5 text-xs"
				title="Toggle progress log"
			>
				<ChevronDownIcon class="size-3.5 transition-transform {showLog ? 'rotate-180' : ''}" />
				Log ({generationState.completedNodes.length}{generationState.status === 'generating' ? '+1' : ''})
			</button>
		{/if}

		{#if generationState.status === 'generating' && doCancel}
			<button
				onclick={doCancel}
				class="btn preset-outlined flex items-center gap-1.5"
			>
				<SquareIcon class="size-4" /> Stop
			</button>
		{/if}

		<button
			onclick={() => (showExport = true)}
			class="btn preset-outlined flex items-center gap-1.5"
		>
			<DownloadIcon class="size-4" /> Download
		</button>
	</div>

	<!-- Progress log panel -->
	{#if showLog}
		<div class="py-2 border-b border-surface-200 max-h-40 overflow-y-auto">
			<ol class="space-y-0.5">
				{#each generationState.completedNodes as label, i}
					<li class="flex items-center gap-2 text-xs text-surface-600 px-1 py-0.5">
						<CheckCircle2Icon class="size-3 shrink-0 text-success-500" />
						<span class="truncate">{i + 1}. {label}</span>
					</li>
				{/each}
				{#if generationState.status === 'generating' && generationState.currentNodeLabel}
					<li class="flex items-center gap-2 text-xs text-secondary-600 px-1 py-0.5">
						<Loader2Icon class="size-3 shrink-0 animate-spin" />
						<span class="truncate">{generationState.completedNodes.length + 1}. {generationState.currentNodeLabel}</span>
					</li>
				{/if}
			</ol>
		</div>
	{/if}
</div>

<!-- Document -->
<article class="max-w-[780px] mx-auto pb-16">
	{#if generationState.documentTitle}
		<h1 class="text-3xl font-bold mb-8 text-surface-900">{generationState.documentTitle}</h1>
	{/if}

	{#if generationState.tree.length === 0}
		<p class="text-surface-400 italic">No content to display.</p>
	{:else}
		{#each generationState.tree as node (node.id)}
			{@render renderNode(node, 0)}
		{/each}
	{/if}
</article>

{#if showExport}
	<ExportModal
		tree={generationState.tree}
		documentTitle={generationState.documentTitle}
		onClose={() => (showExport = false)}
	/>
{/if}

<!-- ── Render snippets ─────────────────────────────────────────────────── -->

{#snippet renderNode(node: TreeNode, depth: number)}
	{#if node.type === 'section'}
		{@render renderSection(node, depth)}
	{:else}
		{@render renderContent(node)}
	{/if}
{/snippet}

{#snippet renderSection(node: TreeNode, depth: number)}
	<div class="mt-8 first:mt-0">
		{#if depth === 0}
			<h2 class="text-2xl font-bold text-surface-900 mb-4 pb-1 border-b border-surface-200">{node.label}</h2>
		{:else if depth === 1}
			<h3 class="text-xl font-semibold text-surface-800 mb-3">{node.label}</h3>
		{:else if depth === 2}
			<h4 class="text-lg font-medium text-surface-800 mb-2">{node.label}</h4>
		{:else}
			<h5 class="text-base font-medium text-surface-700 mb-2">{node.label}</h5>
		{/if}

		{#each node.children as child (child.id)}
			{@render renderNode(child, depth + 1)}
		{/each}
	</div>
{/snippet}

{#snippet renderContent(node: TreeNode)}
	{@const isActive = generationState.currentNodeId === node.id}
	<div class="mb-4">
		{#if node.type === 'text_block'}
			{#if node.generated_content !== null}
				{@const paras = node.generated_content.split('\n\n').filter(Boolean)}
				{#if paras.length > 0}
					{#each paras as para, i}
						<p class="mb-3 leading-relaxed text-surface-800">
							{para}{#if isActive && i === paras.length - 1}<span
									class="inline-block w-0.5 h-[1.1em] bg-secondary-500 animate-pulse ml-0.5 align-text-bottom"
								></span>{/if}
						</p>
					{/each}
				{:else if isActive}
					<p class="mb-3">
						<span class="inline-block w-0.5 h-[1.1em] bg-secondary-500 animate-pulse align-text-bottom"
						></span>
					</p>
				{/if}
			{:else if node.generate && generationState.status === 'generating'}
				<div class="space-y-2 mb-3">
					<div class="h-4 rounded bg-surface-200 animate-pulse w-full"></div>
					<div class="h-4 rounded bg-surface-200 animate-pulse w-11/12"></div>
					<div class="h-4 rounded bg-surface-200 animate-pulse w-4/5"></div>
				</div>
			{:else if node.content}
				{#each node.content.split('\n\n').filter(Boolean) as para}
					<p class="mb-3 leading-relaxed text-surface-600">{para}</p>
				{/each}
			{/if}

		{:else if node.type === 'code'}
			<pre
				class="bg-surface-900 text-surface-50 p-4 rounded-lg overflow-x-auto my-4 text-sm font-mono leading-relaxed"
			><code>{node.generated_content ?? node.content ?? ''}{#if isActive}<span
						class="inline-block w-0.5 h-[1.1em] bg-secondary-500 animate-pulse ml-0.5 align-text-bottom"
					></span>{/if}</code></pre>

		{:else if node.type === 'image'}
			{#if node.imageUrl}
				<figure class="my-4">
					<img
						src={node.imageUrl}
						alt={node.altText || node.label}
						class="max-w-full rounded-lg shadow"
					/>
					{#if node.altText}
						<figcaption class="text-sm text-center text-surface-500 mt-2 italic"
							>{node.altText}</figcaption
						>
					{/if}
				</figure>
			{:else if isActive}
				<div
					class="border border-surface-200 rounded-lg h-40 flex items-center justify-center gap-2 my-4 text-surface-500 text-sm"
				>
					<Loader2Icon class="size-4 animate-spin shrink-0" />
					Generating image…
				</div>
			{:else if node.generate && generationState.status === 'generating'}
				<div
					class="bg-surface-100 h-40 rounded-lg flex items-center justify-center my-4 text-surface-400 text-sm border border-surface-200 border-dashed"
				>
					Image queued…
				</div>
			{/if}

		{:else if node.type === 'equation'}
			<div class="my-4 py-2 text-center overflow-x-auto">
				{#if node.generated_content}
					{@html renderEquation(node.generated_content)}
				{:else if isActive}
					<span class="inline-block w-0.5 h-[1.1em] bg-secondary-500 animate-pulse align-text-bottom"
					></span>
				{:else if node.generate && generationState.status === 'generating'}
					<div class="h-8 rounded bg-surface-200 animate-pulse w-48 mx-auto"></div>
				{/if}
			</div>

		{:else if node.type === 'table'}
			<div class="my-4 overflow-x-auto">
				{#if node.generated_content}
					{@const parsed = parseMarkdownTable(node.generated_content)}
					{#if parsed}
						<table class="w-full text-sm border-collapse">
							<thead>
								<tr class="bg-surface-100">
									{#each parsed.headers as h}
										<th class="border border-surface-300 px-3 py-2 text-left font-semibold text-surface-800">{h}</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each parsed.rows as row, ri}
									<tr class={ri % 2 === 1 ? 'bg-surface-50' : ''}>
										{#each parsed.headers as _h, i}
											<td class="border border-surface-200 px-3 py-2 text-surface-700">{row[i] ?? ''}</td>
										{/each}
									</tr>
								{/each}
							</tbody>
						</table>
						{#if isActive}<span class="inline-block w-0.5 h-[1.1em] bg-secondary-500 animate-pulse ml-0.5 align-text-bottom"></span>{/if}
					{:else}
						<pre class="text-sm font-mono whitespace-pre-wrap text-surface-800">{node.generated_content}{#if isActive}<span class="inline-block w-0.5 h-[1.1em] bg-secondary-500 animate-pulse ml-0.5 align-text-bottom"></span>{/if}</pre>
					{/if}
				{:else if node.generate && generationState.status === 'generating'}
					<div class="space-y-1.5">
						<div class="h-8 rounded bg-surface-200 animate-pulse w-full"></div>
						{#if isActive}
							<div class="h-7 rounded bg-surface-100 animate-pulse w-full"></div>
							<div class="h-7 rounded bg-surface-100 animate-pulse w-full"></div>
						{:else}
							<div class="h-7 rounded bg-surface-100 animate-pulse w-4/5"></div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/snippet}

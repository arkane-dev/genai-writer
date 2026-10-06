<script lang="ts">
	import '@cyberpunk-apps/neondeck/styles.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/state';
	import { AppShell, Tag, Toaster } from '@cyberpunk-apps/neondeck';
	import WindowControls from '$lib/WindowControls.svelte';
	import { inWails } from '$lib/platform/env';
	import { currentDoc } from '$lib/currentDoc.svelte';
	import { getConfig } from '$lib/config';

	let { children } = $props();

	const nav = [
		{ label: 'Editor', zh: '写作', href: '#/' },
		{ label: 'Documents', zh: '文档', href: '#/documents' },
		{ label: 'Settings', zh: '设置', href: '#/admin' }
	];
	// Hash router: page.url.hash holds the route ("#/documents"); "" means the editor.
	// The preview belongs to the editor, so it lights up Editor too.
	const current = $derived.by(() => {
		const h = page.url.hash || '#/';
		return h.startsWith('#/preview') ? '#/' : h;
	});
	// Re-read on navigation so the status bar follows Settings changes.
	const model = $derived((void page.url.hash, getConfig().model));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<AppShell brand="GENAI_WRITER_" home="#/" clock={false}>
	{#snippet actions()}
		<WindowControls />
	{/snippet}

	{#snippet sidebar()}
		<nav class="side" aria-label="App">
			{#each nav as item (item.href)}
				<a href={item.href} class:active={current === item.href} aria-current={current === item.href ? 'page' : undefined}>
					<span class="zh" lang="zh-Hans" aria-hidden="true">{item.zh}</span>{item.label}
				</a>
			{/each}
		</nav>
	{/snippet}

	{#snippet status()}
		<span><Tag tone={inWails ? 'success' : 'warning'} dot>{inWails ? 'native' : 'browser'}</Tag></span>
		<span class="doc">{currentDoc.id ? `doc: ${currentDoc.title || 'untitled'}` : 'no document open'}</span>
		<span>model: {model || 'none'}</span>
		<span style="margin-left:auto">root@genai-writer:~#</span>
	{/snippet}

	<div class="page">
		{@render children()}
	</div>
</AppShell>

<Toaster />

<style>
	/* The top bar is the window's title bar: drag it to move the window. */
	:global(.nd-shell > .topbar) { --wails-draggable: drag; }
	:global(.nd-shell > .topbar a, .nd-shell > .topbar button) { --wails-draggable: no-drag; }

	.page {
		max-width: 80rem;
		margin: 0 auto;
		padding: var(--nd-space-6) clamp(1rem, 3vw, 2.5rem) var(--nd-space-10);
	}

	.side { display: grid; gap: 2px; padding-top: var(--nd-space-4); }
	.side a {
		display: flex;
		align-items: baseline;
		gap: var(--nd-space-3);
		padding: var(--nd-space-2) var(--nd-space-3);
		border-left: 2px solid transparent;
		color: var(--nd-text-dim);
		font-family: var(--nd-font-ui);
		font-weight: 600;
		letter-spacing: var(--nd-tracking-label);
		text-decoration: none;
		text-transform: uppercase;
	}
	.side a:hover { background: var(--nd-surface-2); color: var(--nd-text); text-shadow: none; }
	.side a.active { border-left-color: var(--nd-accent); background: var(--nd-accent-tint); color: var(--nd-accent); }
	.zh { font-family: var(--nd-font-cjk); font-weight: 900; letter-spacing: 0.04em; }
	.doc { max-width: 40ch; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>

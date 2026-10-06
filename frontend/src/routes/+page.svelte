<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import DocumentHeader from '$lib/DocumentHeader.svelte';
	import DocumentTree from '$lib/DocumentTree.svelte';
	import type { DocumentOptions } from '$lib/types';
	import { currentDoc } from '$lib/currentDoc.svelte';
	import { store } from '$lib/platform/store.svelte';
	import { Button } from '@cyberpunk-apps/neondeck';

	let documentTitle = $state('');
	let documentOptions = $state<DocumentOptions>({
		generateExecutiveSummary: false,
		generateIntroduction: false,
		generateConclusion: false,
		generateReferences: false,
	});
	let showOptions = $state(false);

	let titleSaveTimer: ReturnType<typeof setTimeout> | null = null;

	// Load the document title from DB when the active document changes.
	// untrack() prevents this effect re-firing when documentTitle is written.
	$effect(() => {
		const id = currentDoc.id;
		if (!id || !browser) return;
		store.getDocument(id).then((doc) => {
			if (doc) untrack(() => { documentTitle = doc.title; });
		});
	});

	// Debounce-save title edits back to the DB.
	$effect(() => {
		const title = documentTitle;
		const id = currentDoc.id;
		if (!id || !browser) return;
		if (titleSaveTimer) clearTimeout(titleSaveTimer);
		titleSaveTimer = setTimeout(() => {
			store.updateDocument(id, { title, updatedAt: Date.now() });
			currentDoc.setTitle(title);
		}, 800);
	});

	function closeDocument() {
		currentDoc.close();
		documentTitle = '';
	}
</script>

<svelte:head>
	<title>{documentTitle || 'GenAI Writer'}</title>
</svelte:head>

{#if currentDoc.id}
	<div class="crumbs">
		<span class="nd-meta">&gt; <a href="#/documents">documents</a> / {documentTitle || 'untitled'}</span>
		<Button variant="ghost" size="sm" onclick={closeDocument} title="Close document">Close</Button>
	</div>

	<DocumentHeader bind:documentTitle bind:documentOptions bind:showOptions />
	<DocumentTree {documentOptions} {documentTitle} documentId={currentDoc.id} />
{:else}
	<div class="empty nd-hatch">
		<p class="nd-meta">&gt; NO_DOCUMENT_LOADED<span class="nd-cursor"></span></p>
		<h1>No document open</h1>
		<p class="lede">Open a document, or start a new one.</p>
		<Button arrow onclick={() => goto('#/documents')}>Browse documents</Button>
	</div>
{/if}

<style>
	.crumbs {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--nd-space-3);
		margin-bottom: var(--nd-space-4);
	}
	.crumbs a { color: var(--nd-accent-2); }
	.empty {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--nd-space-3);
		margin-top: 12vh;
		padding: var(--nd-space-10) var(--nd-space-8);
		border: 1px solid var(--nd-line);
	}
	.empty h1 { margin: 0; font-size: var(--nd-text-3xl); }
	.lede { color: var(--nd-text-dim); margin: 0 0 var(--nd-space-3); }
</style>

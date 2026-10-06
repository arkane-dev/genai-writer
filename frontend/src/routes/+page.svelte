<script lang="ts">
	import { untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import DocumentHeader from '$lib/DocumentHeader.svelte';
	import DocumentTree from '$lib/DocumentTree.svelte';
	import type { DocumentOptions } from '$lib/types';
	import { currentDoc } from '$lib/currentDoc.svelte';
	import { store } from '$lib/platform/store.svelte';
	import { FolderOpenIcon, XIcon } from '@lucide/svelte';

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
	<title>{documentTitle || 'AI Writer'}</title>
</svelte:head>

{#if currentDoc.id}
	<!-- Breadcrumb / close bar -->
	<div class="flex items-center gap-1.5 text-sm text-surface-500 mb-3 -mt-1">
		<a href="#/documents" class="hover:text-primary-600 transition-colors">Documents</a>
		<span class="text-surface-300">›</span>
		<span class="flex-1 truncate text-surface-700 font-medium">{documentTitle || 'Untitled'}</span>
		<button
			onclick={closeDocument}
			class="flex items-center gap-1 px-2 py-1 rounded text-surface-400 hover:text-surface-700 hover:bg-surface-100 transition-colors text-xs"
			title="Close document"
		>
			<XIcon class="size-3.5" /> Close
		</button>
	</div>

	<DocumentHeader bind:documentTitle bind:documentOptions bind:showOptions />
	<DocumentTree {documentOptions} {documentTitle} documentId={currentDoc.id} />
{:else}
	<div class="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center">
		<FolderOpenIcon class="size-16 text-surface-300" />
		<div class="space-y-2">
			<h2 class="h2">No document open</h2>
			<p class="text-surface-500">Open an existing document or create a new one to get started.</p>
		</div>
		<button
			onclick={() => goto('#/documents')}
			class="btn preset-filled-primary-500"
		>
			Browse Documents
		</button>
	</div>
{/if}

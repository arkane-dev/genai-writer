<script lang="ts">
	import { goto } from '$app/navigation';
	import { Dialog } from '@skeletonlabs/skeleton-svelte';
	import {
		FolderPlusIcon,
		FilePlusIcon,
		FolderIcon,
		FolderOpenIcon,
		FileTextIcon,
		Trash2Icon,
	} from '@lucide/svelte';
	import { store, library, type Folder, type Document } from '$lib/platform/store.svelte';
	import { currentDoc } from '$lib/currentDoc.svelte';

	// ── Reactive data ──────────────────────────────────────────────────────────

	let folders: Folder[] = $state([]);
	let documents: Document[] = $state([]);
	let selectedFolderId = $state<number | null | 'all'>('all');

	// Re-read the library after every write (library.version bumps on each one).
	$effect(() => {
		void library.version;
		let stale = false;
		Promise.all([store.listFolders(), store.listDocuments()]).then(([f, d]) => {
			if (stale) return;
			folders = f;
			documents = d;
		});
		return () => { stale = true; };
	});



	let visibleDocuments = $derived(
		selectedFolderId === 'all'
			? documents
			: documents.filter((d) => d.folderId === selectedFolderId)
	);

	// ── Create folder dialog ───────────────────────────────────────────────────

	let showFolderDialog = $state(false);
	let newFolderName = $state('');

	async function createFolder() {
		const name = newFolderName.trim();
		if (!name) return;
		await store.addFolder({ name, parentId: null, createdAt: Date.now() });
		newFolderName = '';
		showFolderDialog = false;
	}

	// ── Create document dialog ─────────────────────────────────────────────────

	let showDocDialog = $state(false);
	let newDocTitle = $state('');
	let newDocFolderId = $state<number | null>(null);

	async function createDocument() {
		const title = newDocTitle.trim() || 'Untitled Document';
		const id = await store.addDocument({
			title,
			folderId: newDocFolderId,
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});
		newDocTitle = '';
		newDocFolderId = null;
		showDocDialog = false;
		openDocument(id, title);
	}

	// ── Open document ──────────────────────────────────────────────────────────

	function openDocument(id: number, title: string) {
		currentDoc.open(id, title);
		goto('#/');
	}

	// ── Rename / delete ────────────────────────────────────────────────────────

	async function deleteDocument(doc: Document, e: MouseEvent) {
		e.stopPropagation();
		if (!confirm(`Delete "${doc.title}"? Its history will also be removed.`)) return;
		await store.deleteDocument(doc.id!);
		if (currentDoc.id === doc.id) currentDoc.close();
	}

	async function deleteFolder(folder: Folder, e: MouseEvent) {
		e.stopPropagation();
		const count = documents.filter((d) => d.folderId === folder.id).length;
		const msg = count
			? `Delete folder "${folder.name}"? The ${count} document(s) inside will be moved to root.`
			: `Delete folder "${folder.name}"?`;
		if (!confirm(msg)) return;
		await store.deleteFolder(folder.id!);
		if (selectedFolderId === folder.id) selectedFolderId = 'all';
	}

	async function handleDocRename(doc: Document, el: HTMLElement) {
		const title = el.textContent?.trim() || 'Untitled Document';
		if (title === doc.title) return;
		await store.updateDocument(doc.id!, { title, updatedAt: Date.now() });
		if (currentDoc.id === doc.id) currentDoc.setTitle(title);
	}

	async function handleFolderRename(folder: Folder, el: HTMLElement) {
		const name = el.textContent?.trim() || folder.name;
		if (name === folder.name) return;
		await store.renameFolder(folder.id!, name);
	}

	function formatDate(ts: number): string {
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
	}
</script>

<svelte:head>
	<title>Documents — AI Writer</title>
</svelte:head>

<!-- ── Page header ─────────────────────────────────────────────────────────── -->
<div class="flex items-center justify-between mb-6 flex-wrap gap-3">
	<h1 class="h2">Documents</h1>
	<div class="flex gap-2">
		<button
			onclick={() => (showFolderDialog = true)}
			class="btn preset-outlined flex items-center gap-2"
		>
			<FolderPlusIcon class="size-4" /> New Folder
		</button>
		<button
			onclick={() => (showDocDialog = true)}
			class="btn preset-filled-primary-500 flex items-center gap-2"
		>
			<FilePlusIcon class="size-4" /> New Document
		</button>
	</div>
</div>

<!-- ── Body ────────────────────────────────────────────────────────────────── -->
<div class="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">

	<!-- Folder list -->
	<aside class="space-y-1">
		<p class="text-xs font-semibold text-surface-400 uppercase tracking-wide px-2 mb-2">Folders</p>

		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			role="button"
			class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors
				{selectedFolderId === 'all' ? 'bg-primary-100 text-primary-700 font-medium' : 'hover:bg-surface-100'}"
			onclick={() => (selectedFolderId = 'all')}
		>
			<FolderOpenIcon class="size-4 shrink-0" />
			<span class="text-sm flex-1">All Documents</span>
			<span class="text-xs text-surface-400">{documents.length}</span>
		</div>

		<!-- svelte-ignore a11y_interactive_supports_focus -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
			role="button"
			class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors
				{selectedFolderId === null ? 'bg-primary-100 text-primary-700 font-medium' : 'hover:bg-surface-100'}"
			onclick={() => (selectedFolderId = null)}
		>
			<FolderIcon class="size-4 shrink-0 text-surface-400" />
			<span class="text-sm flex-1 text-surface-500">Unfiled</span>
			<span class="text-xs text-surface-400">{documents.filter((d) => d.folderId === null).length}</span>
		</div>

		{#each folders as folder (folder.id)}
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				role="button"
				class="group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors
					{selectedFolderId === folder.id ? 'bg-primary-100 text-primary-700 font-medium' : 'hover:bg-surface-100'}"
				onclick={() => (selectedFolderId = folder.id!)}
			>
				<FolderIcon class="size-4 shrink-0 text-amber-500" />
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<span
					class="text-sm flex-1 outline-none truncate"
					contenteditable="true"
					spellcheck="false"
					onmousedown={(e) => e.stopPropagation()}
					onblur={(e) => handleFolderRename(folder, e.currentTarget as HTMLElement)}
					onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); } }}
				>{folder.name}</span>
				<span class="text-xs text-surface-400">{documents.filter((d) => d.folderId === folder.id).length}</span>
				<button
					onclick={(e) => deleteFolder(folder, e)}
					class="opacity-0 group-hover:opacity-100 p-0.5 rounded text-surface-400 hover:text-red-500 transition-opacity"
					title="Delete folder"
				>
					<Trash2Icon class="size-3" />
				</button>
			</div>
		{/each}
	</aside>

	<!-- Document grid -->
	<section>
		{#if visibleDocuments.length === 0}
			<div class="flex flex-col items-center justify-center py-20 text-center gap-4">
				<FileTextIcon class="size-12 text-surface-200" />
				<p class="text-surface-400 text-sm">No documents here yet.</p>
				<button
					onclick={() => (showDocDialog = true)}
					class="btn preset-outlined-primary-500 btn-sm"
				>
					Create one
				</button>
			</div>
		{:else}
			<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each visibleDocuments as doc (doc.id)}
					<!-- svelte-ignore a11y_interactive_supports_focus -->
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						role="button"
						class="group relative flex flex-col gap-2 p-4 rounded-xl border bg-white
							hover:border-primary-300 hover:shadow-md transition-all cursor-pointer
							{currentDoc.id === doc.id ? 'border-primary-400 bg-primary-50' : 'border-surface-200'}"
						onclick={() => openDocument(doc.id!, doc.title)}
					>
						<div class="flex items-start gap-2">
							<FileTextIcon class="size-5 text-primary-500 shrink-0 mt-0.5" />
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="flex-1 text-sm font-medium text-surface-800 outline-none"
								contenteditable="true"
								spellcheck="false"
								onmousedown={(e) => e.stopPropagation()}
								onblur={(e) => handleDocRename(doc, e.currentTarget as HTMLElement)}
								onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); } }}
							>{doc.title}</div>
							<button
								onclick={(e) => deleteDocument(doc, e)}
								class="opacity-0 group-hover:opacity-100 p-1 rounded text-surface-400 hover:text-red-500 transition-opacity shrink-0"
								title="Delete document"
							>
								<Trash2Icon class="size-3.5" />
							</button>
						</div>

						{#if doc.folderId}
							{@const folder = folders.find((f) => f.id === doc.folderId)}
							{#if folder}
								<div class="flex items-center gap-1 text-xs text-amber-600">
									<FolderIcon class="size-3" />
									{folder.name}
								</div>
							{/if}
						{/if}

						<p class="text-xs text-surface-400 mt-auto pt-1">
							Updated {formatDate(doc.updatedAt)}
						</p>

						{#if currentDoc.id === doc.id}
							<span class="absolute top-2 right-8 text-[10px] px-1.5 py-0.5 rounded bg-primary-500 text-white font-medium">
								open
							</span>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>

<!-- ── New Folder dialog ─────────────────────────────────────────────────────── -->
<Dialog
	open={showFolderDialog}
	onOpenChange={(e) => { showFolderDialog = e.open; if (!e.open) newFolderName = ''; }}
>
	<Dialog.Backdrop class="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />
	<Dialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<Dialog.Content class="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
			<h2 class="text-lg font-semibold">New Folder</h2>
			<label class="label">
				<span class="label-text">Folder name</span>
				<input
					class="input"
					type="text"
					placeholder="e.g. Research"
					bind:value={newFolderName}
					onkeydown={(e) => { if (e.key === 'Enter') createFolder(); }}
				/>
			</label>
			<div class="flex justify-end gap-2 pt-2">
				<button onclick={() => (showFolderDialog = false)} class="btn preset-outlined">Cancel</button>
				<button onclick={createFolder} class="btn preset-filled-primary-500" disabled={!newFolderName.trim()}>
					Create
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Positioner>
</Dialog>

<!-- ── New Document dialog ───────────────────────────────────────────────────── -->
<Dialog
	open={showDocDialog}
	onOpenChange={(e) => { showDocDialog = e.open; if (!e.open) { newDocTitle = ''; newDocFolderId = null; } }}
>
	<Dialog.Backdrop class="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />
	<Dialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<Dialog.Content class="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
			<h2 class="text-lg font-semibold">New Document</h2>
			<label class="label">
				<span class="label-text">Title</span>
				<input
					class="input"
					type="text"
					placeholder="Untitled Document"
					bind:value={newDocTitle}
					onkeydown={(e) => { if (e.key === 'Enter') createDocument(); }}
				/>
			</label>
			{#if folders.length > 0}
				<label class="label">
					<span class="label-text">Folder <span class="text-surface-400">(optional)</span></span>
					<select class="select" bind:value={newDocFolderId}>
						<option value={null}>None</option>
						{#each folders as f (f.id)}
							<option value={f.id}>{f.name}</option>
						{/each}
					</select>
				</label>
			{/if}
			<div class="flex justify-end gap-2 pt-2">
				<button onclick={() => (showDocDialog = false)} class="btn preset-outlined">Cancel</button>
				<button onclick={createDocument} class="btn preset-filled-primary-500">
					Create
				</button>
			</div>
		</Dialog.Content>
	</Dialog.Positioner>
</Dialog>

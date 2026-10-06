<script lang="ts">
	import { goto } from '$app/navigation';
	import { Dialog, Panel, Button, Input, Select, SectionHeader, Tag } from '@cyberpunk-apps/neondeck';
	import { PencilIcon, Trash2Icon } from '@lucide/svelte';
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

	async function deleteDocument(doc: Document) {
		if (!confirm(`Delete "${doc.title}"? Its history will also be removed.`)) return;
		await store.deleteDocument(doc.id!);
		if (currentDoc.id === doc.id) currentDoc.close();
	}

	async function deleteFolder(folder: Folder) {
		const count = documents.filter((d) => d.folderId === folder.id).length;
		const msg = count
			? `Delete folder "${folder.name}"? The ${count} document(s) inside will be moved to root.`
			: `Delete folder "${folder.name}"?`;
		if (!confirm(msg)) return;
		await store.deleteFolder(folder.id!);
		if (selectedFolderId === folder.id) selectedFolderId = 'all';
	}

	// Inline rename: one item at a time, keyed "doc:<id>" or "folder:<id>".
	let renaming = $state<string | null>(null);
	let renameText = $state('');
	function startRename(key: string, current: string) {
		renaming = key;
		renameText = current;
	}
	async function finishRename(commit: boolean) {
		const key = renaming;
		renaming = null;
		if (!commit || !key) return;
		const [kind, idText] = key.split(':');
		const id = Number(idText);
		if (kind === 'doc') {
			const doc = documents.find((d) => d.id === id);
			if (doc) await handleDocRename(doc, renameText);
		} else {
			const folder = folders.find((f) => f.id === id);
			if (folder) await handleFolderRename(folder, renameText);
		}
	}
	function renameKeys(e: KeyboardEvent) {
		if (e.key === 'Enter') finishRename(true);
		else if (e.key === 'Escape') {
			e.preventDefault();
			finishRename(false);
		}
	}

	async function handleDocRename(doc: Document, text: string) {
		const title = text.trim() || 'Untitled Document';
		if (title === doc.title) return;
		await store.updateDocument(doc.id!, { title, updatedAt: Date.now() });
		if (currentDoc.id === doc.id) currentDoc.setTitle(title);
	}

	async function handleFolderRename(folder: Folder, text: string) {
		const name = text.trim() || folder.name;
		if (name === folder.name) return;
		await store.renameFolder(folder.id!, name);
	}

	function formatDate(ts: number): string {
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ts));
	}
</script>

<svelte:head>
	<title>Documents · GenAI Writer</title>
</svelte:head>

<SectionHeader index="01" zh="文档" title="Documents" meta="{documents.length} doc{documents.length === 1 ? '' : 's'} · {folders.length} folder{folders.length === 1 ? '' : 's'}" />

<div class="bar">
	<Button variant="outline" onclick={() => (showFolderDialog = true)}>New folder</Button>
	<Button onclick={() => (showDocDialog = true)}>New document</Button>
</div>

<div class="layout">
	<nav class="folders" aria-label="Folders">
		<p class="nd-label">Folders</p>
		<ul>
			<li class:on={selectedFolderId === 'all'}>
				<button class="pick" aria-pressed={selectedFolderId === 'all'} onclick={() => (selectedFolderId = 'all')}>
					<span class="name">All documents</span><span class="count">{documents.length}</span>
				</button>
			</li>
			<li class:on={selectedFolderId === null}>
				<button class="pick" aria-pressed={selectedFolderId === null} onclick={() => (selectedFolderId = null)}>
					<span class="name">Unfiled</span><span class="count">{documents.filter((d) => d.folderId === null).length}</span>
				</button>
			</li>
			{#each folders as folder (folder.id)}
				<li class:on={selectedFolderId === folder.id}>
					{#if renaming === `folder:${folder.id}`}
						<!-- svelte-ignore a11y_autofocus -->
						<input class="rename" aria-label="Folder name" bind:value={renameText} autofocus onkeydown={renameKeys} onblur={() => finishRename(true)} />
					{:else}
						<button class="pick" aria-pressed={selectedFolderId === folder.id} onclick={() => (selectedFolderId = folder.id!)}>
							<span class="name">{folder.name}</span><span class="count">{documents.filter((d) => d.folderId === folder.id).length}</span>
						</button>
						<span class="acts">
							<button class="act" aria-label="Rename folder {folder.name}" title="Rename" onclick={() => startRename(`folder:${folder.id}`, folder.name)}><PencilIcon size={13} /></button>
							<button class="act del" aria-label="Delete folder {folder.name}" title="Delete" onclick={() => deleteFolder(folder)}><Trash2Icon size={13} /></button>
						</span>
					{/if}
				</li>
			{/each}
		</ul>
	</nav>

	<section aria-label="Documents">
		{#if visibleDocuments.length === 0}
			<div class="empty nd-hatch">
				<p class="nd-meta">&gt; NO_DOCUMENTS_HERE</p>
				<Button variant="outline" onclick={() => (showDocDialog = true)}>Create one</Button>
			</div>
		{:else}
			<div class="grid">
				{#each visibleDocuments as doc, i (doc.id)}
					{@const folder = doc.folderId ? folders.find((f) => f.id === doc.folderId) : undefined}
					<Panel index={String(i + 1).padStart(2, '0')} title={doc.title} meta={folder?.name ?? 'unfiled'} cut="sm" active={currentDoc.id === doc.id}>
						{#if renaming === `doc:${doc.id}`}
							<!-- svelte-ignore a11y_autofocus -->
							<input class="rename" aria-label="Document title" bind:value={renameText} autofocus onkeydown={renameKeys} onblur={() => finishRename(true)} />
						{/if}
						<p class="nd-meta updated">updated {formatDate(doc.updatedAt)}</p>
						<div class="card-acts">
							{#if currentDoc.id === doc.id}<Tag tone="success" dot>open</Tag>{/if}
							<span class="spacer"></span>
							<button class="act" aria-label="Rename {doc.title}" title="Rename" onclick={() => startRename(`doc:${doc.id}`, doc.title)}><PencilIcon size={14} /></button>
							<button class="act del" aria-label="Delete {doc.title}" title="Delete" onclick={() => deleteDocument(doc)}><Trash2Icon size={14} /></button>
							<Button size="sm" variant="outline" arrow onclick={() => openDocument(doc.id!, doc.title)} aria-label="Open {doc.title}">Open</Button>
						</div>
					</Panel>
				{/each}
			</div>
		{/if}
	</section>
</div>

<Dialog bind:open={showFolderDialog} title="New folder" size="sm" onclose={() => (newFolderName = '')}>
	<Input label="Folder name" placeholder="Research" bind:value={newFolderName} onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') createFolder(); }} />
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (showFolderDialog = false)}>Cancel</Button>
		<Button onclick={createFolder} disabled={!newFolderName.trim()}>Create</Button>
	{/snippet}
</Dialog>

<Dialog bind:open={showDocDialog} title="New document" size="sm" onclose={() => { newDocTitle = ''; newDocFolderId = null; }}>
	<div class="form">
		<Input label="Title" placeholder="Untitled document" bind:value={newDocTitle} onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') createDocument(); }} />
		{#if folders.length > 0}
			<Select label="Folder (optional)" bind:value={newDocFolderId}>
				<option value={null}>None</option>
				{#each folders as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
			</Select>
		{/if}
	</div>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (showDocDialog = false)}>Cancel</Button>
		<Button onclick={createDocument}>Create</Button>
	{/snippet}
</Dialog>

<style>
	.bar { display: flex; justify-content: flex-end; gap: var(--nd-space-3); margin: calc(var(--nd-space-2) * -1) 0 var(--nd-space-5); }
	.layout { display: grid; grid-template-columns: 14rem minmax(0, 1fr); gap: var(--nd-space-6); align-items: start; }

	.folders ul { margin: var(--nd-space-2) 0 0; padding: 0; list-style: none; border-top: 1px solid var(--nd-line); }
	.folders li { display: flex; align-items: center; border-bottom: 1px solid var(--nd-line); border-left: 2px solid transparent; }
	.folders li.on { border-left-color: var(--nd-accent); background: var(--nd-accent-tint); }
	.pick {
		display: flex;
		flex: 1;
		min-width: 0;
		gap: var(--nd-space-2);
		padding: var(--nd-space-2) var(--nd-space-3);
		border: 0;
		background: transparent;
		text-align: left;
		cursor: pointer;
	}
	.pick:hover { background: var(--nd-surface-2); }
	.on .pick { color: var(--nd-accent); }
	.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--nd-font-ui); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; font-size: var(--nd-text-sm); }
	.count { font-family: var(--nd-font-mono); font-size: var(--nd-text-xs); color: var(--nd-text-mute); }
	.acts { display: flex; opacity: 0; }
	.folders li:hover .acts, .folders li:focus-within .acts { opacity: 1; }
	.act { display: grid; place-items: center; width: 1.75rem; height: 1.75rem; border: 0; background: transparent; color: var(--nd-text-mute); cursor: pointer; }
	.act:hover { background: var(--nd-surface-2); color: var(--nd-text); }
	.act.del:hover { color: var(--nd-danger); }
	.rename {
		flex: 1;
		width: 100%;
		margin: var(--nd-space-1) 0;
		padding: var(--nd-space-1) var(--nd-space-2);
		border: 1px solid var(--nd-accent);
		outline: none;
		background: var(--nd-void);
		font-family: var(--nd-font-mono);
		font-size: var(--nd-text-sm);
	}

	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); gap: var(--nd-space-4); }
	.updated { margin: 0 0 var(--nd-space-3); }
	.card-acts { display: flex; align-items: center; gap: var(--nd-space-1); }
	.spacer { flex: 1; }
	.empty { display: flex; flex-direction: column; align-items: center; gap: var(--nd-space-3); padding: var(--nd-space-12) var(--nd-space-4); border: 1px solid var(--nd-line); }
	.form { display: flex; flex-direction: column; gap: var(--nd-space-4); }

	@media (max-width: 860px) { .layout { grid-template-columns: 1fr; } }
</style>

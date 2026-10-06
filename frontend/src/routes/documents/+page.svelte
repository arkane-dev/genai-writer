<!-- Documents as a shelf of data shards. Folders are shelves; documents are shards standing on them.
     Click a shard to open it. Drag it to another shelf to move it, or use its Move action. -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { Dialog, Button, Input, Select, SectionHeader } from '@cyberpunk-apps/neondeck';
	import { PencilIcon, Trash2Icon, MoveRightIcon } from '@lucide/svelte';
	import DataShard from '$lib/DataShard.svelte';
	import { store, library, type Folder, type Document } from '$lib/platform/store.svelte';
	import { currentDoc } from '$lib/currentDoc.svelte';

	// ── Library ─────────────────────────────────────────────────────────────────

	let folders: Folder[] = $state([]);
	let documents: Document[] = $state([]);

	// Re-read the library after every write (library.version bumps on each one).
	$effect(() => {
		void library.version;
		let stale = false;
		Promise.all([store.listFolders(), store.listDocuments()]).then(([f, d]) => {
			if (stale) return;
			folders = f;
			documents = d;
		});
		return () => {
			stale = true;
		};
	});

	interface Shelf {
		id: number | null; // null = unfiled
		name: string;
		docs: Document[];
		folder?: Folder;
	}
	// Unfiled first, so new documents are always in view. Then shelves by name.
	const shelves = $derived<Shelf[]>([
		{ id: null, name: 'Unfiled', docs: documents.filter((d) => d.folderId === null) },
		...folders.map((f) => ({ id: f.id!, name: f.name, folder: f, docs: documents.filter((d) => d.folderId === f.id) }))
	]);
	const shelfOptions = $derived(shelves.map((s) => ({ value: s.id === null ? '' : String(s.id), label: s.name })));

	function openDocument(doc: Document) {
		currentDoc.open(doc.id!, doc.title);
		goto('#/');
	}

	const formatDate = (ts: number) => new Intl.DateTimeFormat(undefined, { dateStyle: 'short' }).format(new Date(ts));
	const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

	// ── New document / shelf ────────────────────────────────────────────────────

	let showDocDialog = $state(false);
	let newDocTitle = $state('');
	let newDocShelf = $state(''); // '' = unfiled

	function newDocOn(shelf: Shelf) {
		newDocShelf = shelf.id === null ? '' : String(shelf.id);
		showDocDialog = true;
	}

	async function createDocument() {
		const title = newDocTitle.trim() || 'Untitled document';
		const id = await store.addDocument({
			title,
			folderId: newDocShelf === '' ? null : Number(newDocShelf),
			createdAt: Date.now(),
			updatedAt: Date.now()
		});
		newDocTitle = '';
		showDocDialog = false;
		currentDoc.open(id, title);
		goto('#/');
	}

	let showShelfDialog = $state(false);
	let newShelfName = $state('');

	async function createShelf() {
		const name = newShelfName.trim();
		if (!name) return;
		await store.addFolder({ name, parentId: null, createdAt: Date.now() });
		newShelfName = '';
		showShelfDialog = false;
	}

	// ── Rename / move / delete (one dialog each) ────────────────────────────────

	let renameTarget = $state<{ kind: 'doc'; doc: Document } | { kind: 'shelf'; folder: Folder } | null>(null);
	let renameText = $state('');
	let renameOpen = $state(false);

	function startRename(target: NonNullable<typeof renameTarget>) {
		renameTarget = target;
		renameText = target.kind === 'doc' ? target.doc.title : target.folder.name;
		renameOpen = true;
	}

	async function confirmRename() {
		const t = renameTarget;
		renameOpen = false;
		if (!t) return;
		const text = renameText.trim();
		if (t.kind === 'doc') {
			const title = text || 'Untitled document';
			if (title === t.doc.title) return;
			await store.updateDocument(t.doc.id!, { title, updatedAt: Date.now() });
			if (currentDoc.id === t.doc.id) currentDoc.setTitle(title);
		} else if (text && text !== t.folder.name) {
			await store.renameFolder(t.folder.id!, text);
		}
	}

	let moveDoc = $state<Document | null>(null);
	let moveTo = $state('');
	let moveOpen = $state(false);

	function startMove(doc: Document) {
		moveDoc = doc;
		moveTo = doc.folderId === null ? '' : String(doc.folderId);
		moveOpen = true;
	}

	async function moveToShelf(doc: Document, shelfId: number | null) {
		if (doc.folderId === shelfId) return;
		await store.updateDocument(doc.id!, { folderId: shelfId });
	}

	async function confirmMove() {
		moveOpen = false;
		if (moveDoc) await moveToShelf(moveDoc, moveTo === '' ? null : Number(moveTo));
	}

	let deleteTarget = $state<{ kind: 'doc'; doc: Document } | { kind: 'shelf'; folder: Folder; count: number } | null>(null);
	let deleteOpen = $state(false);

	function startDelete(target: NonNullable<typeof deleteTarget>) {
		deleteTarget = target;
		deleteOpen = true;
	}

	async function confirmDelete() {
		const t = deleteTarget;
		deleteOpen = false;
		if (!t) return;
		if (t.kind === 'doc') {
			await store.deleteDocument(t.doc.id!);
			if (currentDoc.id === t.doc.id) currentDoc.close();
		} else {
			await store.deleteFolder(t.folder.id!);
		}
	}

	// ── Drag a shard to another shelf ───────────────────────────────────────────

	let dragging = $state<Document | null>(null);
	let overShelf = $state<number | null | undefined>(undefined); // undefined = none

	function onDragStart(e: DragEvent, doc: Document) {
		dragging = doc;
		e.dataTransfer?.setData('text/plain', String(doc.id));
		if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
	}
	function onDragOver(e: DragEvent, shelf: Shelf) {
		if (!dragging) return;
		e.preventDefault();
		overShelf = shelf.id;
	}
	async function onDrop(e: DragEvent, shelf: Shelf) {
		e.preventDefault();
		const doc = dragging;
		dragging = null;
		overShelf = undefined;
		if (doc) await moveToShelf(doc, shelf.id);
	}
	function onDragEnd() {
		dragging = null;
		overShelf = undefined;
	}
</script>

<svelte:head>
	<title>Documents · GenAI Writer</title>
</svelte:head>

<SectionHeader index="01" zh="书架" title="Documents" meta="{plural(documents.length, 'shard')} · {plural(folders.length, 'shelf', 'shelves')}" />

<div class="shelves">
	{#each shelves as shelf, si (shelf.id ?? 'unfiled')}
		<section class="shelf" class:over={overShelf === shelf.id} aria-labelledby="shelf-{shelf.id ?? 'u'}">
			<header>
				<span class="nd-index">/{String(si + 1).padStart(2, '0')}</span>
				<h2 id="shelf-{shelf.id ?? 'u'}">{shelf.name}</h2>
				<span class="nd-meta">{plural(shelf.docs.length, 'shard')}</span>
				<span class="spacer"></span>
				{#if shelf.folder}
					{@const folder = shelf.folder}
					<button class="act" aria-label="Rename shelf {shelf.name}" title="Rename shelf" onclick={() => startRename({ kind: 'shelf', folder })}><PencilIcon size={14} /></button>
					<button class="act del" aria-label="Delete shelf {shelf.name}" title="Delete shelf" onclick={() => startDelete({ kind: 'shelf', folder, count: shelf.docs.length })}><Trash2Icon size={14} /></button>
				{/if}
			</header>

			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="row" ondragover={(e) => onDragOver(e, shelf)} ondragleave={() => (overShelf = undefined)} ondrop={(e) => onDrop(e, shelf)}>
				{#each shelf.docs as doc (doc.id)}
					<div class="slot">
						<DataShard
							docId={doc.id!}
							title={doc.title}
							updated={formatDate(doc.updatedAt)}
							loaded={currentDoc.id === doc.id}
							draggable="true"
							ondragstart={(e: DragEvent) => onDragStart(e, doc)}
							ondragend={onDragEnd}
							onclick={() => openDocument(doc)}
						/>
						<div class="acts" role="group" aria-label="{doc.title} actions">
							<button class="act" aria-label="Rename {doc.title}" title="Rename" onclick={() => startRename({ kind: 'doc', doc })}><PencilIcon size={14} /></button>
							<button class="act" aria-label="Move {doc.title} to another shelf" title="Move to shelf" onclick={() => startMove(doc)}><MoveRightIcon size={14} /></button>
							<button class="act del" aria-label="Delete {doc.title}" title="Delete" onclick={() => startDelete({ kind: 'doc', doc })}><Trash2Icon size={14} /></button>
						</div>
					</div>
				{/each}
				<div class="slot">
					<button class="empty nd-hatch" onclick={() => newDocOn(shelf)}>
						<span class="plus" aria-hidden="true">+</span>
						<span class="nd-label">New shard<span class="sr"> on {shelf.name}</span></span>
					</button>
				</div>
			</div>
			<div class="rail" aria-hidden="true">
				<span>SHELF_{String(si + 1).padStart(2, '0')} // {shelf.name.toUpperCase()}</span>
			</div>
		</section>
	{/each}

	<button class="new-shelf" onclick={() => (showShelfDialog = true)}>
		<span class="plus" aria-hidden="true">+</span>
		<span class="nd-label">New shelf</span>
	</button>
</div>

<Dialog bind:open={showDocDialog} title="New document" size="sm" onclose={() => (newDocTitle = '')}>
	<div class="form">
		<Input label="Title" placeholder="Untitled document" bind:value={newDocTitle} onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') createDocument(); }} />
		<Select label="Shelf" bind:value={newDocShelf} options={shelfOptions} />
	</div>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (showDocDialog = false)}>Cancel</Button>
		<Button onclick={createDocument}>Create</Button>
	{/snippet}
</Dialog>

<Dialog bind:open={showShelfDialog} title="New shelf" size="sm" onclose={() => (newShelfName = '')}>
	<Input label="Shelf name" placeholder="Research" bind:value={newShelfName} onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') createShelf(); }} />
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (showShelfDialog = false)}>Cancel</Button>
		<Button onclick={createShelf} disabled={!newShelfName.trim()}>Create</Button>
	{/snippet}
</Dialog>

<Dialog bind:open={renameOpen} title={renameTarget?.kind === 'shelf' ? 'Rename shelf' : 'Rename document'} size="sm">
	<Input label="Name" bind:value={renameText} onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') confirmRename(); }} />
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (renameOpen = false)}>Cancel</Button>
		<Button onclick={confirmRename}>Rename</Button>
	{/snippet}
</Dialog>

<Dialog bind:open={moveOpen} title="Move to shelf" size="sm" meta={moveDoc?.title}>
	<Select label="Shelf" bind:value={moveTo} options={shelfOptions} />
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (moveOpen = false)}>Cancel</Button>
		<Button onclick={confirmMove}>Move</Button>
	{/snippet}
</Dialog>

<Dialog bind:open={deleteOpen} title={deleteTarget?.kind === 'shelf' ? 'Delete shelf' : 'Delete document'} size="sm">
	{#if deleteTarget?.kind === 'doc'}
		<p>Delete “{deleteTarget.doc.title}” and all of its history? This can't be undone.</p>
	{:else if deleteTarget?.kind === 'shelf'}
		<p>
			Delete the shelf “{deleteTarget.folder.name}”?
			{#if deleteTarget.count}Its {plural(deleteTarget.count, 'document')} move to Unfiled. Nothing is deleted.{/if}
		</p>
	{/if}
	{#snippet footer()}
		<Button variant="ghost" onclick={() => (deleteOpen = false)}>Cancel</Button>
		<Button variant="danger" onclick={confirmDelete}>Delete</Button>
	{/snippet}
</Dialog>

<style>
	.shelves { display: flex; flex-direction: column; gap: var(--nd-space-10); }

	.shelf header { display: flex; align-items: baseline; gap: var(--nd-space-3); margin-bottom: var(--nd-space-2); }
	h2 { margin: 0; font-family: var(--nd-font-ui); font-size: var(--nd-text-lg); letter-spacing: var(--nd-tracking-label); }
	.spacer { flex: 1; }

	/* Shards stand on the rail. The row scrolls sideways when a shelf is full. */
	.row {
		display: flex;
		align-items: flex-end;
		gap: var(--nd-space-5);
		overflow-x: auto;
		padding: var(--nd-space-5) var(--nd-space-2) 0;
	}
	.slot { position: relative; flex: none; }
	/* Shard actions: a small panel on the top-right corner, beside the connector. */
	.acts {
		position: absolute;
		top: 0;
		right: -0.4rem;
		z-index: 1;
		display: flex;
		flex-direction: column;
		border: 1px solid var(--nd-line-strong);
		background: var(--nd-surface-3);
		opacity: 0;
		transition: opacity var(--nd-dur-fast) var(--nd-ease);
	}
	.slot:hover .acts, .slot:focus-within .acts { opacity: 1; }
	.act { display: grid; place-items: center; width: 1.75rem; height: 1.75rem; border: 0; background: transparent; color: var(--nd-text-mute); cursor: pointer; }
	.act:hover { background: var(--nd-surface-2); color: var(--nd-text); }
	.act.del:hover { color: var(--nd-danger); }

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--nd-space-2);
		width: 8.25rem;
		height: 14.5rem;
		border: 1px solid var(--nd-line);
		background-color: transparent;
		color: var(--nd-text-mute);
		cursor: pointer;
	}
	/* Quieter hatching than .nd-hatch: an empty slot shouldn't outshine the shards. */
	.empty.nd-hatch { background-image: repeating-linear-gradient(-45deg, color-mix(in srgb, var(--nd-line) 55%, transparent) 0 1px, transparent 1px 10px); }
	.empty:hover { border-color: var(--nd-accent); color: var(--nd-accent); }
	.empty:focus-visible { outline: 2px solid var(--nd-focus); outline-offset: 4px; }
	.plus { font-family: var(--nd-font-mono); font-size: var(--nd-text-3xl); line-height: 1; }

	/* The shelf: a lit dock bar the shards stand on. */
	.rail {
		position: relative;
		height: 1.1rem;
		border-top: 2px solid var(--nd-line-strong);
		background: linear-gradient(var(--nd-surface-3), var(--nd-surface-1) 60%, var(--nd-bg));
		box-shadow: 0 6px 14px color-mix(in srgb, var(--nd-void) 80%, transparent);
		transition: border-color var(--nd-dur-fast) var(--nd-ease), box-shadow var(--nd-dur-fast) var(--nd-ease);
	}
	.rail span {
		position: absolute;
		top: 0.3rem;
		right: var(--nd-space-2);
		font-family: var(--nd-font-mono);
		font-size: var(--nd-text-2xs);
		color: var(--nd-text-mute);
		line-height: 1;
	}
	/* Drop target: the shelf lights up. */
	.shelf.over .rail { border-top-color: var(--nd-accent); box-shadow: 0 -2px 12px color-mix(in srgb, var(--nd-accent) 45%, transparent); }
	.shelf.over .row { background: var(--nd-accent-tint); }

	.new-shelf {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--nd-space-3);
		padding: var(--nd-space-5);
		border: 1px solid var(--nd-line);
		background: transparent;
		color: var(--nd-text-mute);
		cursor: pointer;
	}
	.new-shelf:hover { border-color: var(--nd-accent); color: var(--nd-accent); }
	.new-shelf .plus { font-size: var(--nd-text-xl); }
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
	.form { display: flex; flex-direction: column; gap: var(--nd-space-4); }
</style>

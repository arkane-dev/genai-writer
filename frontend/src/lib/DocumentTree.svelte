<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { TreeNode, DocumentOptions } from '$lib/types';
	import { isSection, makeSection, makeContent } from '$lib/types';
	import TreeNodeComponent from '$lib/TreeNode.svelte';
	import DocumentPreview from '$lib/DocumentPreview.svelte';
	import { dragState } from '$lib/dragState.svelte';
	import SectionEditModal from '$lib/SectionEditModal.svelte';
	import ContentEditModal from '$lib/ContentEditModal.svelte';
	import HistoryPanel from '$lib/HistoryPanel.svelte';
	import ExportModal from '$lib/ExportModal.svelte';
	import { store, library, type Snapshot, type Snippet } from '$lib/platform/store.svelte';
	import { diffTrees, describeChanges, serializeTree, relativeTime } from '$lib/history';
	import { clipboardState } from '$lib/clipboardState.svelte';
	import { Button, Dialog, Input, Textarea } from '@cyberpunk-apps/neondeck';
	import { generateItem, generateSection } from '$lib/generation';
	import { generationState } from '$lib/generationState.svelte';
	import { findAncestors } from '$lib/contextExtractor';
	import { toaster } from '$lib/toaster';
	import {
		PlusIcon,
		Undo2Icon,
		Redo2Icon,
		HistoryIcon,
		SparklesIcon,
		DownloadIcon,
		CopyIcon,
		LayoutTemplateIcon,
		EyeIcon,
		EyeOffIcon,
	} from '@lucide/svelte';

	let { documentOptions, documentTitle = '', documentId }: {
		documentOptions: DocumentOptions;
		documentTitle?: string;
		documentId: number;
	} = $props();

	// ── Tree state ─────────────────────────────────────────────────────────────

	let tree = $state<TreeNode[]>([]);

	let uid = $state(100);

	// ── UI state ───────────────────────────────────────────────────────────────

	let undoStack = $state<number[]>([]);
	let redoStack = $state<number[]>([]);
	let currentSnapshotId = $state<number | null>(null);
	let snapshotDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let saveStatus = $state<'idle' | 'saving' | 'saved'>('idle');
	let saveStatusTimer: ReturnType<typeof setTimeout> | null = null;
	let isGenerating = $state(false);
	let toolbarVisible = $state(true);
	let toolbarEl = $state<HTMLDivElement | undefined>(undefined);

	let editingSection = $state<TreeNode | null>(null);
	let editingContent = $state<{ sectionId: string; content: TreeNode } | null>(null);
	let showHistory = $state(false);
	let showExport = $state(false);
	let showPreview = $state(false);

	function handlePreviewUpdate(nodeId: string, field: 'generated_content' | 'content', value: string) {
		const result = findNode(nodeId);
		if (!result) return;
		if (field === 'generated_content') {
			result.node.generated_content = value;
		} else {
			result.node.content = value;
		}
		scheduleSnapshot();
	}

	// ── Snippets & clipboard ───────────────────────────────────────────────────

	let snippets = $state<Snippet[]>([]);
	let showSnippetMenu = $state(false);
	let showSaveSnippetModal = $state(false);
	let snippetTargetNode = $state<TreeNode | null>(null);
	let snippetName = $state('');
	let snippetDescription = $state('');

	$effect(() => {
		void library.version; // re-read after every write
		let stale = false;
		store.listSnippets().then((v) => { if (!stale) snippets = v; });
		return () => { stale = true; };
	});

	function reIdSubtree(node: TreeNode, uidRef: { current: number }): TreeNode {
		return {
			...node,
			id: 'n' + (uidRef.current++),
			children: node.children.map((c) => reIdSubtree(c, uidRef)),
		};
	}

	function copySection(node: TreeNode) {
		clipboardState.copy($state.snapshot(node) as TreeNode);
		toaster.create({ title: `"${node.label}" copied`, description: 'Paste via Custom → clipboard', type: 'success' });
	}

	function pasteFromClipboard() {
		const copied = clipboardState.node;
		if (!copied) return;
		const uidRef = { current: uid };
		const reIdded = reIdSubtree(JSON.parse(JSON.stringify(copied)) as TreeNode, uidRef);
		uid = uidRef.current;
		tree = [...tree, reIdded];
		saveSnapshot(`Pasted "${reIdded.label}"`);
		showSnippetMenu = false;
	}

	async function insertSnippet(snippet: Snippet) {
		const node = JSON.parse(snippet.tree) as TreeNode;
		const uidRef = { current: uid };
		const reIdded = reIdSubtree(node, uidRef);
		uid = uidRef.current;
		tree = [...tree, reIdded];
		await saveSnapshot(`Inserted snippet "${snippet.name}"`);
		showSnippetMenu = false;
	}

	function openSaveSnippetModal(node: TreeNode) {
		snippetTargetNode = $state.snapshot(node) as TreeNode;
		snippetName = node.label;
		snippetDescription = '';
		showSaveSnippetModal = true;
	}

	async function confirmSaveSnippet() {
		if (!snippetTargetNode || !snippetName.trim()) return;
		const serialized = serializeTree([snippetTargetNode]);
		await store.addSnippet({
			name: snippetName.trim(),
			description: snippetDescription.trim(),
			tree: JSON.stringify(serialized[0]),
			createdAt: Date.now(),
		});
		const saved = snippetName.trim();
		showSaveSnippetModal = false;
		snippetTargetNode = null;
		snippetName = '';
		snippetDescription = '';
		toaster.create({ title: `Snippet "${saved}" saved`, type: 'success' });
	}

	// ── Snapshot helpers ───────────────────────────────────────────────────────

	function setSaved() {
		saveStatus = 'saved';
		if (saveStatusTimer) clearTimeout(saveStatusTimer);
		saveStatusTimer = setTimeout(() => { saveStatus = 'idle'; }, 2000);
	}

	async function saveSnapshot(message?: string): Promise<void> {
		const serialized = serializeTree(tree);
		const prevSnapshot = currentSnapshotId != null ? await store.getSnapshot(documentId, currentSnapshotId) : null;
		const prevTree = prevSnapshot ? (JSON.parse(prevSnapshot.tree) as TreeNode[]) : [];
		const diffs = diffTrees(prevTree, serialized);
		if (diffs.length === 0) return;

		const id = await store.addSnapshot({
			documentId,
			timestamp: Date.now(),
			message: message ?? describeChanges(diffs),
			tree: JSON.stringify(serialized),
		});

		undoStack = [...undoStack, id];
		redoStack = [];
		currentSnapshotId = id;
		setSaved();
	}

	function scheduleSnapshot(): void {
		saveStatus = 'saving';
		if (snapshotDebounceTimer) clearTimeout(snapshotDebounceTimer);
		snapshotDebounceTimer = setTimeout(() => {
			saveSnapshot();
			snapshotDebounceTimer = null;
		}, 1500);
	}

	async function undo(): Promise<void> {
		if (undoStack.length <= 1) return;
		const current = undoStack[undoStack.length - 1];
		const prevId = undoStack[undoStack.length - 2];
		const snapshot = await store.getSnapshot(documentId, prevId);
		if (!snapshot) return;
		redoStack = [...redoStack, current];
		undoStack = undoStack.slice(0, -1);
		tree = JSON.parse(snapshot.tree) as TreeNode[];
		currentSnapshotId = prevId;
	}

	async function redo(): Promise<void> {
		if (redoStack.length === 0) return;
		const nextId = redoStack[redoStack.length - 1];
		const snapshot = await store.getSnapshot(documentId, nextId);
		if (!snapshot) return;
		redoStack = redoStack.slice(0, -1);
		undoStack = [...undoStack, nextId];
		tree = JSON.parse(snapshot.tree) as TreeNode[];
		currentSnapshotId = nextId;
	}

	async function restoreSnapshot(snapshot: Snapshot): Promise<void> {
		tree = JSON.parse(snapshot.tree) as TreeNode[];
		await saveSnapshot(`Restored to "${snapshot.message}" (${relativeTime(snapshot.timestamp)})`);
		showHistory = false;
	}

	function handleKeydown(e: KeyboardEvent): void {
		const mod = e.ctrlKey || e.metaKey;
		if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
		else if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
	}

	// ── Tree traversal ─────────────────────────────────────────────────────────

	function findNode(id: string, nodes: TreeNode[] = tree): { node: TreeNode; parent: TreeNode[]; idx: number } | null {
		for (let i = 0; i < nodes.length; i++) {
			if (nodes[i].id === id) return { node: nodes[i], parent: nodes, idx: i };
			const r = findNode(id, nodes[i].children);
			if (r) return r;
		}
		return null;
	}

	function isAncestor(potentialAncestorId: string, nodeId: string): boolean {
		const r = findNode(potentialAncestorId);
		if (!r) return false;
		function search(children: TreeNode[]): boolean {
			for (const c of children) {
				if (c.id === nodeId) return true;
				if (c.children && search(c.children)) return true;
			}
			return false;
		}
		return search(r.node.children ?? []);
	}

	function removeNode(id: string): TreeNode | null {
		const r = findNode(id);
		if (!r) return null;
		const [removed] = r.parent.splice(r.idx, 1);
		// $state.snapshot() strips the Svelte proxy so reinserting the node
		// doesn't leave a phantom identity at the old location (each_key_duplicate).
		return $state.snapshot(removed) as TreeNode;
	}

	function insertNode(node: TreeNode, targetId: string, position: 'before' | 'after' | 'inside') {
		if (position === 'inside') {
			const r = findNode(targetId);
			if (!r || !isSection(r.node)) return;
			r.node.children.unshift(node);
		} else {
			if (targetId === 'root') {
				if (position === 'after') tree.push(node);
				else tree.unshift(node);
				return;
			}
			const r = findNode(targetId);
			if (!r) return;
			const at = position === 'after' ? r.idx + 1 : r.idx;
			r.parent.splice(at, 0, node);
		}
	}

	// ── CRUD ───────────────────────────────────────────────────────────────────

	function addSection() {
		const n = makeSection('n' + (uid++));
		tree.push(n);
		saveSnapshot(`Added section "${n.label}"`);
	}

	function addContent(sectionId: string, contentType: string) {
		const r = findNode(sectionId);
		if (!r) return;
		const n = makeContent('n' + (uid++), contentType as TreeNode['type']);
		r.node.children.push(n);
		saveSnapshot(`Added ${n.label} to "${r.node.label}"`);
	}

	function addSubSection(parentId: string) {
		const r = findNode(parentId);
		if (!r) return;
		const n = makeSection('n' + (uid++));
		r.node.children.push(n);
		saveSnapshot(`Added section to "${r.node.label}"`);
	}

	function addSectionAbove(id: string) {
		const ref = findNode(id);
		const label = ref?.node.label ?? '';
		const n = makeSection('n' + (uid++));
		insertNode(n, id, 'before');
		saveSnapshot(label ? `Added section above "${label}"` : 'Added section');
	}

	function addSectionBelow(id: string) {
		const ref = findNode(id);
		const label = ref?.node.label ?? '';
		const n = makeSection('n' + (uid++));
		insertNode(n, id, 'after');
		saveSnapshot(label ? `Added section below "${label}"` : 'Added section');
	}

	function deleteNode(id: string) {
		const r = findNode(id);
		const label = r?.node.label ?? 'item';
		const type = r?.node.type ?? 'node';
		removeNode(id);
		saveSnapshot(`Deleted ${type.replace('_', ' ')} "${label}"`);
	}

	function toggleOpen(id: string) {
		const r = findNode(id);
		if (r) r.node.open = !r.node.open;
	}

	function setLabel(id: string, val: string) {
		const r = findNode(id);
		if (r) r.node.label = val;
		scheduleSnapshot();
	}

	function setDesc(id: string, val: string) {
		const r = findNode(id);
		if (r) r.node.desc = val;
		scheduleSnapshot();
	}

	// ── Edit modals ────────────────────────────────────────────────────────────

	function closeSectionEdit(data: Partial<TreeNode> | null) {
		if (data && editingSection) {
			const r = findNode(editingSection.id);
			if (r) Object.assign(r.node, data);
		}
		editingSection = null;
		saveSnapshot();
	}

	function closeContentEdit(data: Partial<TreeNode> | null) {
		if (data && editingContent) {
			const r = findNode(editingContent.content.id);
			if (r) Object.assign(r.node, data);
		}
		editingContent = null;
		saveSnapshot();
	}

	function openEdit(node: TreeNode, parentSectionId: string | null) {
		if (isSection(node)) {
			editingSection = node;
		} else {
			editingContent = { sectionId: parentSectionId ?? node.id, content: node };
		}
	}

	// ── Drag-drop ──────────────────────────────────────────────────────────────

	function handleDrop(draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') {
		if (draggedId === targetId) return;
		if (isAncestor(draggedId, targetId)) return;
		const removed = removeNode(draggedId);
		if (removed) insertNode(removed, targetId, position);
		saveSnapshot('Reordered items');
	}

	function handleRootDrop(draggedId: string) {
		const removed = removeNode(draggedId);
		if (removed) tree.push(removed);
		saveSnapshot('Reordered sections');
	}

	function onRootDragOver(e: DragEvent) {
		// Only accept drops directly on the root container (not on a node inside it)
		if (!dragState.draggedId) return;
		const overNode = (e.target as Element).closest('[data-tree-node-id]');
		if (overNode) return;
		e.preventDefault();
		e.dataTransfer!.dropEffect = 'move';
	}

	function onRootDrop(e: DragEvent) {
		const overNode = (e.target as Element).closest('[data-tree-node-id]');
		if (overNode) return;
		e.preventDefault();
		const draggedId = e.dataTransfer!.getData('text/plain');
		if (!draggedId) return;
		handleRootDrop(draggedId);
		dragState.end();
	}

	// ── AI generation ──────────────────────────────────────────────────────────

	async function triggerSectionGenerate(section: TreeNode): Promise<void> {
		if (isGenerating) return;
		isGenerating = true;
		try {
			const ancestors = findAncestors(section.id, tree);
			await generateSection(section, ancestors, { current: uid });
			uid = uid;
			await saveSnapshot(`Generated section "${section.label}"`);
			toaster.create({ title: 'Section generated', type: 'success' });
		} catch (err) {
			toaster.create({ title: 'Generation failed', description: String(err), type: 'error' });
		} finally {
			isGenerating = false;
		}
	}

	async function triggerItemGenerate(node: TreeNode, parentSectionId: string | null): Promise<void> {
		if (isGenerating) return;
		isGenerating = true;
		const section = parentSectionId ? findNode(parentSectionId)?.node ?? null : null;
		try {
			// Ancestor chain: sections above the parent section
			const ancestors = parentSectionId ? findAncestors(parentSectionId, tree) : [];
			await generateItem(node, section, ancestors);
			await saveSnapshot(`Generated ${node.type.replace('_', ' ')} "${node.label}"`);
			toaster.create({ title: 'Content generated', type: 'success' });
		} catch (err) {
			toaster.create({ title: 'Generation failed', description: String(err), type: 'error' });
		} finally {
			isGenerating = false;
		}
	}

	async function handleGenerateDocument(): Promise<void> {
		if (isGenerating) return;
		generationState.tree = $state.snapshot(tree) as TreeNode[];
		generationState.documentTitle = documentTitle;
		generationState.documentOptions = { ...documentOptions };
		generationState.documentId = documentId;
		generationState.uidCurrent = uid;
		generationState.status = 'generating';
		generationState.currentNodeId = null;
		generationState.currentNodeLabel = '';
		generationState.completedNodes = [];
		generationState.error = null;
		await goto('#/preview');
	}

	function handleGenerate(node: TreeNode, parentSectionId: string | null) {
		if (isSection(node)) {
			triggerSectionGenerate(node);
		} else {
			triggerItemGenerate(node, parentSectionId);
		}
	}

	// ── Init ───────────────────────────────────────────────────────────────────

	function computeMaxUid(nodes: TreeNode[]): number {
		let max = 99;
		for (const node of nodes) {
			const num = parseInt(node.id.replace(/^n/, ''), 10);
			if (!isNaN(num)) max = Math.max(max, num);
			if (node.children.length) max = Math.max(max, computeMaxUid(node.children));
		}
		return max;
	}

	async function initFromDB() {
		const all = await store.listSnapshots(documentId);
		if (all.length > 0) {
			const latest = all[all.length - 1];
			tree = JSON.parse(latest.tree) as TreeNode[];
			uid = computeMaxUid(tree) + 1;
			undoStack = all.map((s) => s.id as number);
			currentSnapshotId = latest.id as number;
		} else {
			tree = [];
			undoStack = [];
			redoStack = [];
			currentSnapshotId = null;
			await saveSnapshot('Initial state');
		}
	}

	// Re-initialise whenever the active document changes
	$effect(() => {
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		documentId; // tracked dependency
		initFromDB();
	});

	onMount(() => {
		window.addEventListener('keydown', handleKeydown);
		const obs = toolbarEl
			? new IntersectionObserver(
					(entries) => { toolbarVisible = entries[0].isIntersecting; },
					{ threshold: 0.1 }
				)
			: null;
		if (obs && toolbarEl) obs.observe(toolbarEl);
		return () => {
			window.removeEventListener('keydown', handleKeydown);
			obs?.disconnect();
		};
	});
</script>

<!-- Toolbar -->
<div bind:this={toolbarEl} class="toolbar">
	<Button variant="outline" onclick={addSection}>
		{#snippet icon()}<PlusIcon />{/snippet}
		Add section
	</Button>

	<div class="group" role="group" aria-label="History">
		<Button variant="outline" onclick={undo} disabled={undoStack.length <= 1} title="Undo (Ctrl+Z)" aria-label="Undo">
			{#snippet icon()}<Undo2Icon />{/snippet}
		</Button>
		<Button variant="outline" onclick={redo} disabled={redoStack.length === 0} title="Redo (Ctrl+Y / Ctrl+Shift+Z)" aria-label="Redo">
			{#snippet icon()}<Redo2Icon />{/snippet}
		</Button>
	</div>

	<!-- Custom: clipboard paste + saved snippets -->
	<div class="menu-anchor">
		<Button
			variant="outline"
			onclick={(e: MouseEvent) => { e.stopPropagation(); showSnippetMenu = !showSnippetMenu; }}
			title="Insert from clipboard or snippets"
			aria-expanded={showSnippetMenu}
			aria-haspopup="menu"
		>
			{#snippet icon()}<LayoutTemplateIcon />{/snippet}
			Insert ▾
		</Button>

		{#if showSnippetMenu}
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="scrim" onclick={() => { showSnippetMenu = false; }}></div>
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="menu" onclick={(e) => e.stopPropagation()}>
				{#if clipboardState.node}
					<p class="nd-label menu-head">Clipboard</p>
					<button class="item" onclick={pasteFromClipboard}>
						<CopyIcon size={14} aria-hidden="true" />
						<span class="truncate">Paste "{clipboardState.node.label}"</span>
					</button>
				{/if}
				<p class="nd-label menu-head">Snippets</p>
				{#if snippets.length === 0}
					<p class="menu-empty">No snippets yet. Save one from a section's menu.</p>
				{:else}
					{#each snippets as snippet (snippet.id)}
						<button class="item stacked" onclick={() => insertSnippet(snippet)}>
							<span class="truncate">{snippet.name}</span>
							{#if snippet.description}<span class="truncate sub">{snippet.description}</span>{/if}
						</button>
					{/each}
				{/if}
			</div>
		{/if}
	</div>

	<Button onclick={handleGenerateDocument} disabled={isGenerating} title="Generate the whole document">
		{#snippet icon()}<SparklesIcon />{/snippet}
		{isGenerating ? 'Generating…' : 'Generate'}
	</Button>

	<Button variant="outline" onclick={() => (showExport = true)} title="Download the document">
		{#snippet icon()}<DownloadIcon />{/snippet}
		Export
	</Button>

	<Button variant={showPreview ? 'primary' : 'outline'} accent="cyan" onclick={() => { showPreview = !showPreview; }} aria-pressed={showPreview} title={showPreview ? 'Hide preview' : 'Show preview'}>
		{#snippet icon()}{#if showPreview}<EyeOffIcon />{:else}<EyeIcon />{/if}{/snippet}
		Preview
	</Button>

	<div class="right">
		<span class="save nd-meta" aria-live="polite">
			{#if saveStatus === 'saving'}&gt; saving<span class="nd-cursor"></span>{:else if saveStatus === 'saved'}<span class="ok">&gt; saved</span>{/if}
		</span>
		<Button variant="ghost" onclick={() => (showHistory = true)} title="View history">
			{#snippet icon()}<HistoryIcon />{/snippet}
			History
		</Button>
	</div>
</div>

<!-- Tree root (split when preview is active) -->
<div class="work" class:split={showPreview}>
	<!-- Tree pane -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="tree" ondragover={onRootDragOver} ondrop={onRootDrop}>
		{#if tree.length === 0}
			<div class="tree-empty nd-hatch">
				<span class="nd-meta">&gt; EMPTY_TREE // add a section to start</span>
			</div>
		{:else}
			{#each tree as node (node.id)}
				<TreeNodeComponent
					{node}
					depth={0}
					parentSectionId={null}
					{isGenerating}
					onToggle={toggleOpen}
					onSetLabel={setLabel}
					onSetDesc={setDesc}
					onEdit={openEdit}
					onDelete={deleteNode}
					onAddContent={addContent}
					onAddSubSection={addSubSection}
					onAddAbove={addSectionAbove}
					onAddBelow={addSectionBelow}
					onGenerate={handleGenerate}
					onDrop={handleDrop}
					onCopy={copySection}
					onSaveSnippet={openSaveSnippetModal}
				/>
			{/each}
		{/if}
	</div>

	<!-- Preview pane: the document on paper -->
	{#if showPreview}
		<aside class="preview" aria-label="Preview">
			<div class="preview-head">
				<span class="nd-label">Preview</span>
				<span class="nd-meta">click text to edit</span>
			</div>
			<DocumentPreview
				{tree}
				{documentTitle}
				{isGenerating}
				onNodeUpdate={handlePreviewUpdate}
			/>
		</aside>
	{/if}
</div>

<!-- Floating Generate button: only when the toolbar has scrolled out of view -->
{#if !toolbarVisible}
	<div class="float">
		<Button onclick={handleGenerateDocument} disabled={isGenerating}>
			{#snippet icon()}<SparklesIcon />{/snippet}
			{isGenerating ? 'Generating…' : 'Generate'}
		</Button>
	</div>
{/if}

{#if editingSection}
	<SectionEditModal section={editingSection} onClose={closeSectionEdit} />
{/if}

{#if editingContent}
	<ContentEditModal
		sectionId={editingContent.sectionId}
		content={editingContent.content}
		onClose={closeContentEdit}
	/>
{/if}

{#if showHistory}
	<HistoryPanel
		{currentSnapshotId}
		{documentId}
		onRestore={restoreSnapshot}
		onClose={() => (showHistory = false)}
	/>
{/if}

{#if showExport}
	<ExportModal {tree} {documentTitle} onClose={() => (showExport = false)} />
{/if}

<Dialog bind:open={showSaveSnippetModal} title="Save as snippet" size="sm">
	<div class="form">
		<Input
			label="Name"
			bind:value={snippetName}
			onkeydown={(e: KeyboardEvent) => { if (e.key === 'Enter') confirmSaveSnippet(); }}
		/>
		<Textarea label="Description (optional)" rows={2} bind:value={snippetDescription} placeholder="When to use this snippet" />
	</div>
	{#snippet footer()}
		<Button variant="ghost" onclick={() => { showSaveSnippetModal = false; }}>Cancel</Button>
		<Button onclick={confirmSaveSnippet} disabled={!snippetName.trim()}>Save</Button>
	{/snippet}
</Dialog>

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--nd-space-2);
		margin: var(--nd-space-5) 0 var(--nd-space-4);
		padding-bottom: var(--nd-space-3);
		border-bottom: 1px solid var(--nd-line);
	}
	.group { display: flex; gap: var(--nd-space-1); }
	.right { display: flex; align-items: center; gap: var(--nd-space-3); margin-left: auto; }
	.save { min-width: 6rem; text-align: right; }
	.ok { color: var(--nd-success); }

	.menu-anchor { position: relative; display: flex; }
	.scrim { position: fixed; inset: 0; z-index: 10; }
	.menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 20;
		width: 16rem;
		max-height: 20rem;
		overflow-y: auto;
		padding-bottom: var(--nd-space-2);
		border: 1px solid var(--nd-line-strong);
		background: var(--nd-surface-3);
	}
	.menu-head { margin: 0; padding: var(--nd-space-3) var(--nd-space-3) var(--nd-space-1); font-size: var(--nd-text-2xs); }
	.menu-empty { margin: 0; padding: var(--nd-space-1) var(--nd-space-3); color: var(--nd-text-mute); font-size: var(--nd-text-xs); }
	.item {
		display: flex;
		align-items: center;
		gap: var(--nd-space-2);
		width: 100%;
		padding: var(--nd-space-2) var(--nd-space-3);
		border: 0;
		background: transparent;
		text-align: left;
		font-size: var(--nd-text-sm);
		cursor: pointer;
	}
	.item.stacked { flex-direction: column; align-items: flex-start; gap: 0; }
	.item:hover, .item:focus-visible { background: var(--nd-accent-tint); }
	.sub { color: var(--nd-text-mute); font-size: var(--nd-text-xs); }
	.truncate { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.work.split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--nd-space-6); align-items: start; }
	.tree { display: flex; flex-direction: column; gap: var(--nd-space-2); min-height: 200px; }
	.tree-empty { display: grid; place-items: center; min-height: 6rem; border: 1px solid var(--nd-line); }
	.preview { position: sticky; top: calc(var(--nd-topbar-h) + var(--nd-space-4)); max-height: calc(100dvh - var(--nd-topbar-h) - var(--nd-statusbar-h) - var(--nd-space-8)); overflow-y: auto; }
	.preview-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: var(--nd-space-2); }

	.float { position: fixed; right: var(--nd-space-6); bottom: calc(var(--nd-statusbar-h) + var(--nd-space-4)); z-index: 40; }
	.form { display: flex; flex-direction: column; gap: var(--nd-space-4); }

	@media (max-width: 1100px) {
		.work.split { grid-template-columns: 1fr; }
		.preview { position: static; max-height: none; }
	}
</style>

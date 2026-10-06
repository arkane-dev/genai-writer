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
	import { Dialog } from '@skeletonlabs/skeleton-svelte';
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
		ChevronDownIcon,
		LayoutTemplateIcon,
		EyeIcon,
		EyeOffIcon,
		CheckIcon,
		Loader2Icon,
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
<div bind:this={toolbarEl} class="flex items-center gap-2 px-1 pb-3 mb-1 flex-wrap">
	<button onclick={addSection} class="btn preset-filled-primary-500 flex items-center gap-1">
		<PlusIcon class="w-4 h-4" /> Add Section
	</button>

	<div class="flex items-center gap-1">
		<button
			onclick={undo}
			disabled={undoStack.length <= 1}
			class="btn preset-outlined flex items-center gap-1 disabled:opacity-40"
			title="Undo (Ctrl+Z)"
		>
			<Undo2Icon class="w-4 h-4" />
		</button>
		<button
			onclick={redo}
			disabled={redoStack.length === 0}
			class="btn preset-outlined flex items-center gap-1 disabled:opacity-40"
			title="Redo (Ctrl+Y / Ctrl+Shift+Z)"
		>
			<Redo2Icon class="w-4 h-4" />
		</button>
	</div>

	<!-- Custom: clipboard paste + saved snippets -->
	<div class="relative">
		<button
			onclick={(e) => { e.stopPropagation(); showSnippetMenu = !showSnippetMenu; }}
			class="btn preset-outlined flex items-center gap-1"
			title="Insert from clipboard or snippets"
		>
			<LayoutTemplateIcon class="w-4 h-4" /> Custom <ChevronDownIcon class="w-3 h-3" />
		</button>

		{#if showSnippetMenu}
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<div
				class="fixed inset-0 z-10"
				role="button"
				onclick={() => { showSnippetMenu = false; }}
			></div>
			<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div
				class="absolute top-full left-0 mt-1 z-20 bg-white border border-surface-200 rounded-lg shadow-lg w-56 max-h-80 overflow-y-auto"
				onclick={(e) => e.stopPropagation()}
			>
				{#if clipboardState.node}
					<div class="border-b border-surface-100">
						<p class="text-[10px] font-semibold text-surface-400 uppercase tracking-wide px-3 pt-2 pb-1">Clipboard</p>
						<button
							class="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 flex items-center gap-2"
							onclick={pasteFromClipboard}
						>
							<CopyIcon class="size-3.5 text-surface-400 shrink-0" />
							<span class="truncate">Paste "{clipboardState.node.label}"</span>
						</button>
					</div>
				{/if}
				<div>
					<p class="text-[10px] font-semibold text-surface-400 uppercase tracking-wide px-3 pt-2 pb-1">Snippets</p>
					{#if snippets.length === 0 && !clipboardState.node}
						<p class="text-xs text-surface-400 px-3 py-2 italic">No snippets yet. Copy a section or visit Snippets.</p>
					{:else if snippets.length === 0}
						<p class="text-xs text-surface-400 px-3 py-2 italic">No saved snippets.</p>
					{:else}
						{#each snippets as snippet (snippet.id)}
							<button
								class="w-full text-left px-3 py-2 hover:bg-surface-50"
								onclick={() => insertSnippet(snippet)}
							>
								<span class="block truncate text-sm font-medium">{snippet.name}</span>
								{#if snippet.description}
									<span class="block truncate text-xs text-surface-400">{snippet.description}</span>
								{/if}
							</button>
						{/each}
					{/if}
				</div>
				<div class="border-t border-surface-100 p-2">
					<a
						href="#/snippets"
						class="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 px-2 py-1 rounded hover:bg-primary-50"
						onclick={() => { showSnippetMenu = false; }}
					>
						Manage snippets →
					</a>
				</div>
			</div>
		{/if}
	</div>

	<button
		onclick={handleGenerateDocument}
		disabled={isGenerating}
		class="btn preset-filled-secondary-500 flex items-center gap-1 disabled:opacity-40"
		title="Generate entire document"
	>
		<SparklesIcon class="w-4 h-4" />
		{isGenerating ? 'Generating…' : 'Generate'}
	</button>

	<button
		onclick={() => (showExport = true)}
		class="btn preset-outlined flex items-center gap-1"
		title="Download document"
	>
		<DownloadIcon class="w-4 h-4" /> Download
	</button>

	<button
		onclick={() => { showPreview = !showPreview; }}
		class="btn flex items-center gap-1 {showPreview ? 'preset-filled-surface-500' : 'preset-outlined'}"
		title={showPreview ? 'Hide preview' : 'Show inline preview'}
	>
		{#if showPreview}
			<EyeOffIcon class="w-4 h-4" /> Preview
		{:else}
			<EyeIcon class="w-4 h-4" /> Preview
		{/if}
	</button>

	<!-- Autosave indicator -->
	<div class="ml-auto flex items-center gap-2">
		{#if saveStatus === 'saving'}
			<span class="text-xs text-surface-400 flex items-center gap-1">
				<Loader2Icon class="w-3 h-3 animate-spin" /> Saving…
			</span>
		{:else if saveStatus === 'saved'}
			<span class="text-xs text-success-600 flex items-center gap-1">
				<CheckIcon class="w-3 h-3" /> Saved
			</span>
		{/if}

		<button
			onclick={() => (showHistory = true)}
			class="btn preset-outlined flex items-center gap-1"
			title="View history"
		>
			<HistoryIcon class="w-4 h-4" /> History
		</button>
	</div>
</div>

<!-- Tree root (split when preview is active) -->
<div class={showPreview ? 'grid grid-cols-1 lg:grid-cols-2 gap-6 items-start' : ''}>

	<!-- Tree pane -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="flex flex-col gap-2.5 min-h-[200px]"
		ondragover={onRootDragOver}
		ondrop={onRootDrop}
	>
		{#if tree.length === 0}
			<div class="min-h-8 rounded-md border-2 border-dashed border-surface-200 flex items-center justify-center text-xs text-surface-400">
				Add a section to get started
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

	<!-- Preview pane -->
	{#if showPreview}
		<div class="border-l-2 border-surface-100 pl-5 lg:sticky lg:top-4 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
			<div class="flex items-center justify-between mb-4 pb-2 border-b border-surface-100">
				<span class="text-xs font-semibold text-surface-400 uppercase tracking-wide">Preview</span>
				<span class="text-[10px] text-surface-300">Click text to edit</span>
			</div>
			<DocumentPreview
				{tree}
				{documentTitle}
				{isGenerating}
				onNodeUpdate={handlePreviewUpdate}
			/>
		</div>
	{/if}

</div>

<!-- Floating Generate button — only visible when toolbar is scrolled out of view -->
{#if !toolbarVisible}
	<div class="fixed bottom-6 right-6 z-40">
		<button
			onclick={handleGenerateDocument}
			disabled={isGenerating}
			class="btn preset-filled-secondary-500 flex items-center gap-1 shadow-xl disabled:opacity-40"
		>
			<SparklesIcon class="w-4 h-4" />
			{isGenerating ? 'Generating…' : 'Generate'}
		</button>
	</div>
{/if}

<!-- Section Edit Modal -->
{#if editingSection}
	<SectionEditModal section={editingSection} onClose={closeSectionEdit} />
{/if}

<!-- Content Edit Modal -->
{#if editingContent}
	<ContentEditModal
		sectionId={editingContent.sectionId}
		content={editingContent.content}
		onClose={closeContentEdit}
	/>
{/if}

<!-- History Panel -->
{#if showHistory}
	<HistoryPanel
		{currentSnapshotId}
		{documentId}
		onRestore={restoreSnapshot}
		onClose={() => (showHistory = false)}
	/>
{/if}

<!-- Export Modal -->
{#if showExport}
	<ExportModal {tree} {documentTitle} onClose={() => (showExport = false)} />
{/if}

{#if showSaveSnippetModal}
	<Dialog
		open={true}
		onOpenChange={(e) => { if (!e.open) showSaveSnippetModal = false; }}
	>
		<Dialog.Backdrop class="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />
		<Dialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center p-4">
			<Dialog.Content class="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
				<Dialog.Title class="text-lg font-semibold">Save as Snippet</Dialog.Title>
				<label class="label">
					<span class="label-text">Name</span>
					<input
						class="input"
						type="text"
						bind:value={snippetName}
						onkeydown={(e) => { if (e.key === 'Enter') confirmSaveSnippet(); }}
					/>
				</label>
				<label class="label">
					<span class="label-text">Description <span class="text-surface-400">(optional)</span></span>
					<textarea class="textarea rounded-container" rows="2" bind:value={snippetDescription} placeholder="Brief note about when to use this snippet"></textarea>
				</label>
				<div class="flex justify-end gap-2 pt-2">
					<button onclick={() => { showSaveSnippetModal = false; }} class="btn preset-outlined">Cancel</button>
					<button onclick={confirmSaveSnippet} disabled={!snippetName.trim()} class="btn preset-filled-primary-500 disabled:opacity-40">Save</button>
				</div>
			</Dialog.Content>
		</Dialog.Positioner>
	</Dialog>
{/if}

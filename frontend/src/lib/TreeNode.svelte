<script lang="ts">
	import type { TreeNode } from '$lib/types';
	import { isSection } from '$lib/types';
	import { renderToString } from 'katex';
	import {
		ChevronRightIcon,
		PencilIcon,
		SparklesIcon,
		Trash2Icon,
		ArrowUpIcon,
		ArrowDownIcon,
		CopyIcon,
		BookmarkPlusIcon,
	} from '@lucide/svelte';
	import TreeNodeSelf from './TreeNode.svelte';
	import { CONTENT_TYPE_ICONS, CONTENT_TYPE_TAG_CLASSES, CONTENT_TYPE_LABELS } from '$lib/generation';
	import { dragState } from '$lib/dragState.svelte';

	interface Props {
		node: TreeNode;
		depth: number;
		parentSectionId: string | null;
		isGenerating: boolean;
		onToggle: (id: string) => void;
		onSetLabel: (id: string, val: string) => void;
		onSetDesc: (id: string, val: string) => void;
		onEdit: (node: TreeNode, parentSectionId: string | null) => void;
		onDelete: (id: string) => void;
		onAddContent: (sectionId: string, type: string) => void;
		onAddSubSection: (parentId: string) => void;
		onAddAbove: (id: string) => void;
		onAddBelow: (id: string) => void;
		onGenerate: (node: TreeNode, parentSectionId: string | null) => void;
		onDrop: (draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') => void;
		onCopy?: (node: TreeNode) => void;
		onSaveSnippet?: (node: TreeNode) => void;
	}

	let {
		node,
		depth,
		parentSectionId,
		isGenerating,
		onToggle,
		onSetLabel,
		onSetDesc,
		onEdit,
		onDelete,
		onAddContent,
		onAddSubSection,
		onAddAbove,
		onAddBelow,
		onGenerate,
		onDrop,
		onCopy,
		onSaveSnippet,
	}: Props = $props();

	let hovered = $state(false);
	let dropZone = $state<'before' | 'after' | 'inside' | null>(null);
	let nodeEl = $state<HTMLDivElement | undefined>(undefined);
	let headerEl = $state<HTMLDivElement | undefined>(undefined);

	// Merge mouse drag-over indicator with touch drag-over indicator
	const effectiveDropZone = $derived(
		dropZone ?? (dragState.touchDropTargetId === node.id ? dragState.touchDropZone : null)
	);

	// Touch drag state
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let touchStartPos = { x: 0, y: 0 };
	let touchDragging = false;

	const CONTENT_TYPES: [string, string][] = [
		['text_block', '¶ Text Block'],
		['image', '🖼 Image'],
		['code', '</> Code'],
		['equation', 'Eq Equation'],
		['table', '⊞ Table'],
	];

	const INTERACTIVE = 'button, [contenteditable], input, textarea, select, a';

	function onDragStart(e: DragEvent) {
		const target = e.target as HTMLElement;
		// Don't start drag when the pointer is on an interactive child element
		if (target.matches(INTERACTIVE) || target.closest(INTERACTIVE)) {
			e.preventDefault();
			return;
		}
		dragState.start(node.id, node.type);
		e.dataTransfer!.effectAllowed = 'move';
		e.dataTransfer!.setData('text/plain', node.id);
		// Delay opacity so the ghost image still shows the full node
		setTimeout(() => nodeEl?.classList.add('opacity-30'), 0);
		e.stopPropagation();
	}

	function onDragEnd() {
		nodeEl?.classList.remove('opacity-30');
		dragState.end();
		dropZone = null;
	}

	function onDragOver(e: DragEvent) {
		if (!dragState.draggedId || dragState.draggedId === node.id) return;
		e.preventDefault();
		e.stopPropagation();
		const el = headerEl ?? nodeEl;
		if (!el) return;
		const rect = el.getBoundingClientRect();
		const relY = (e.clientY - rect.top) / rect.height;
		if (isSection(node)) {
			// 3-zone: before / inside / after — each 1/3 of the header height
			if (relY < 0.33) dropZone = 'before';
			else if (relY > 0.67) dropZone = 'after';
			else dropZone = 'inside';
		} else {
			dropZone = relY < 0.5 ? 'before' : 'after';
		}
		e.dataTransfer!.dropEffect = 'move';
	}

	function onDragLeave(e: DragEvent) {
		// Clear only when the pointer leaves the header (not just moving into children)
		const el = headerEl ?? nodeEl;
		if (el && !el.contains(e.relatedTarget as Node)) {
			dropZone = null;
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		const draggedId = e.dataTransfer!.getData('text/plain');
		if (draggedId && draggedId !== node.id) {
			onDrop(draggedId, node.id, dropZone ?? 'after');
		}
		dropZone = null;
		dragState.end();
	}

	// Empty-section drop zone handlers
	function handleEmptyDragOver(e: DragEvent) {
		if (!dragState.draggedId) return;
		e.preventDefault();
		e.stopPropagation();
		e.dataTransfer!.dropEffect = 'move';
	}

	function handleEmptyDrop(e: DragEvent) {
		e.preventDefault();
		e.stopPropagation();
		const draggedId = e.dataTransfer!.getData('text/plain');
		if (draggedId) onDrop(draggedId, node.id, 'inside');
		dragState.end();
	}

	// ── Touch drag-and-drop ────────────────────────────────────────────────

	function onHeaderTouchStart(e: TouchEvent) {
		const target = e.target as HTMLElement;
		if (target.matches(INTERACTIVE) || target.closest(INTERACTIVE)) return;
		const touch = e.touches[0];
		touchStartPos = { x: touch.clientX, y: touch.clientY };
		touchDragging = false;
		if (longPressTimer) clearTimeout(longPressTimer);
		longPressTimer = setTimeout(() => {
			longPressTimer = null;
			touchDragging = true;
			dragState.start(node.id, node.type);
			setTimeout(() => nodeEl?.classList.add('opacity-30'), 0);
			window.addEventListener('touchmove', onWindowTouchMove, { passive: false });
			window.addEventListener('touchend', onWindowTouchEnd);
			window.addEventListener('touchcancel', onWindowTouchEnd);
		}, 350);
	}

	function onHeaderTouchMove(e: TouchEvent) {
		if (touchDragging || !longPressTimer) return;
		const touch = e.touches[0];
		const dx = Math.abs(touch.clientX - touchStartPos.x);
		const dy = Math.abs(touch.clientY - touchStartPos.y);
		if (dx > 8 || dy > 8) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	}

	function onHeaderTouchEnd() {
		if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
	}

	function onWindowTouchMove(e: TouchEvent) {
		if (!dragState.draggedId) return;
		e.preventDefault();
		const touch = e.touches[0];
		const el = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null;
		const row = el?.closest('[data-tree-node-id]') as HTMLElement | null;
		const targetId = row?.dataset.treeNodeId ?? null;
		if (!targetId || targetId === dragState.draggedId) { dragState.clearTouchDrop(); return; }
		const header = row?.querySelector('.tree-node-header') as HTMLElement | null;
		const ref = header ?? row;
		if (!ref) { dragState.clearTouchDrop(); return; }
		const rect = ref.getBoundingClientRect();
		const relY = (touch.clientY - rect.top) / rect.height;
		const isTargetSection = row?.dataset.nodeIsSection === 'true';
		let zone: 'before' | 'after' | 'inside';
		if (isTargetSection) {
			if (relY < 0.33) zone = 'before';
			else if (relY > 0.67) zone = 'after';
			else zone = 'inside';
		} else {
			zone = relY < 0.5 ? 'before' : 'after';
		}
		dragState.setTouchDrop(targetId, zone);
	}

	function onWindowTouchEnd() {
		const draggedId = dragState.draggedId;
		const targetId = dragState.touchDropTargetId;
		const zone = dragState.touchDropZone;
		touchDragging = false;
		nodeEl?.classList.remove('opacity-30');
		dragState.end();
		dragState.clearTouchDrop();
		window.removeEventListener('touchmove', onWindowTouchMove);
		window.removeEventListener('touchend', onWindowTouchEnd);
		window.removeEventListener('touchcancel', onWindowTouchEnd);
		if (draggedId && targetId && zone && draggedId !== targetId) {
			onDrop(draggedId, targetId, zone);
		}
	}

	const btnBase = 'bg-transparent border-0 cursor-pointer text-surface-400 px-1 py-[2px] rounded leading-none hover:bg-surface-100 hover:text-surface-700 flex items-center';
</script>

<div class="relative" data-tree-node-id={node.id} data-node-is-section={isSection(node) ? 'true' : 'false'}>
	{#if effectiveDropZone === 'before'}
		<div class="absolute inset-x-0 -top-[3px] h-[3px] bg-primary-500 rounded z-10 pointer-events-none"></div>
	{/if}

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={nodeEl}
		draggable="true"
		class="border border-surface-200 rounded-md transition-all {isSection(node) ? 'bg-surface-50' : 'bg-white'}"
		class:outline={effectiveDropZone === 'inside'}
		class:outline-2={effectiveDropZone === 'inside'}
		class:outline-primary-500={effectiveDropZone === 'inside'}
		ondragstart={onDragStart}
		ondragend={onDragEnd}
	>
		<!-- Header row — drag + touch target (keeps parent indicators from bleeding into children) -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={headerEl}
			class="tree-node-header flex items-center gap-2 px-3 py-2.5 cursor-grab select-none active:cursor-grabbing"
			onmouseenter={() => (hovered = true)}
			onmouseleave={() => (hovered = false)}
			ondragover={onDragOver}
			ondragleave={onDragLeave}
			ondrop={handleDrop}
			ontouchstart={onHeaderTouchStart}
			ontouchmove={onHeaderTouchMove}
			ontouchend={onHeaderTouchEnd}
		>
			<!-- Expand/collapse or type icon -->
			{#if isSection(node)}
				<button
					onclick={(e) => { e.stopPropagation(); onToggle(node.id); }}
					class="w-[18px] h-[18px] flex items-center justify-center rounded flex-shrink-0 cursor-pointer text-surface-400 transition-transform duration-150"
					class:rotate-90={node.open}
				>
					<ChevronRightIcon size={13} />
				</button>
			{:else}
				<div class="w-[18px] h-[18px] flex items-center justify-center flex-shrink-0 text-[12px] text-surface-500">
					{CONTENT_TYPE_ICONS[node.type] ?? '?'}
				</div>
			{/if}

			<!-- Label and description -->
			<div class="flex-1 min-w-0">
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="text-sm font-medium text-surface-700 outline-none truncate"
					contenteditable="true"
					spellcheck="false"
					oninput={(e) => onSetLabel(node.id, (e.currentTarget as HTMLElement).textContent ?? '')}
					onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); } }}
					onmousedown={(e) => e.stopPropagation()}
				>{node.label}</div>

				{#if !isSection(node) && (node.generated_content || node.content)}
					{#if node.type === 'equation'}
						<div class="text-[11px] text-surface-500 mt-px overflow-hidden">
							{@html renderToString(node.generated_content || node.content, { throwOnError: false })}
						</div>
					{:else}
						<p class="text-[11px] text-surface-500 mt-px truncate">
							{((node.generated_content || node.content) ?? '').slice(0, 100)}
						</p>
					{/if}
				{:else}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="text-[11px] text-surface-500 mt-px truncate outline-none"
						contenteditable="true"
						spellcheck="false"
						oninput={(e) => onSetDesc(node.id, (e.currentTarget as HTMLElement).textContent ?? '')}
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); } }}
						onmousedown={(e) => e.stopPropagation()}
					>{node.desc}</div>
				{/if}

				{#if !isSection(node) && node.type === 'image' && node.imageUrl}
					<img src={node.imageUrl} alt={node.altText || ''} class="max-h-10 rounded mt-1" />
				{/if}
			</div>

			<!-- Type badge -->
			{#if isSection(node)}
				<span class="text-[10px] px-[7px] py-[2px] rounded font-medium flex-shrink-0 bg-blue-100 text-blue-700">
					section
				</span>
			{:else}
				<span class="text-[10px] px-[7px] py-[2px] rounded font-medium flex-shrink-0 {CONTENT_TYPE_TAG_CLASSES[node.type] ?? 'bg-surface-100 text-surface-700'}">
					{CONTENT_TYPE_LABELS[node.type] ?? node.type}
				</span>
			{/if}

			<!-- Persistent regenerate button for content nodes -->
			{#if !isSection(node)}
				<button
					onclick={(e) => { e.stopPropagation(); onGenerate(node, parentSectionId); }}
					disabled={isGenerating}
					class="{btnBase} opacity-40 hover:opacity-100 hover:text-green-600 disabled:opacity-20"
					title="Regenerate"
				>
					<SparklesIcon size={13} />
				</button>
			{/if}

			<!-- Action buttons (hover) -->
			{#if hovered}
				<div class="flex gap-1">
					<button
						onclick={(e) => { e.stopPropagation(); onEdit(node, parentSectionId); }}
						class={btnBase}
						title="Edit"
					>
						<PencilIcon size={13} />
					</button>
					{#if isSection(node)}
						<button
							onclick={(e) => { e.stopPropagation(); onAddAbove(node.id); }}
							class="{btnBase} hover:text-blue-600"
							title="Add section above"
						>
							<ArrowUpIcon size={13} />
						</button>
						<button
							onclick={(e) => { e.stopPropagation(); onAddBelow(node.id); }}
							class="{btnBase} hover:text-blue-600"
							title="Add section below"
						>
							<ArrowDownIcon size={13} />
						</button>
						<button
							onclick={(e) => { e.stopPropagation(); onGenerate(node, parentSectionId); }}
							disabled={isGenerating}
							class="{btnBase} hover:text-green-600 disabled:opacity-40"
							title="Generate section"
						>
							<SparklesIcon size={13} />
						</button>
					{/if}
					{#if isSection(node) && onCopy}
						<button
							onclick={(e) => { e.stopPropagation(); onCopy!(node); }}
							class="{btnBase} hover:text-indigo-600"
							title="Copy section"
						>
							<CopyIcon size={13} />
						</button>
					{/if}
					{#if isSection(node) && onSaveSnippet}
						<button
							onclick={(e) => { e.stopPropagation(); onSaveSnippet!(node); }}
							class="{btnBase} hover:text-amber-600"
							title="Save as snippet"
						>
							<BookmarkPlusIcon size={13} />
						</button>
					{/if}
					<button
						onclick={(e) => { e.stopPropagation(); onDelete(node.id); }}
						class="{btnBase} hover:text-red-500"
						title="Delete"
					>
						<Trash2Icon size={13} />
					</button>
				</div>
			{/if}
		</div>

		<!-- Children (sections only, when open) -->
		{#if isSection(node) && node.open}
			<div class="flex flex-col gap-1.5 px-2 pb-2 pl-6">
				{#if node.children.length === 0}
					<!-- Empty section drop zone -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="min-h-8 rounded-md border-2 border-dashed border-surface-200 flex items-center justify-center text-xs text-surface-400 transition-colors duration-100"
						ondragover={handleEmptyDragOver}
						ondrop={handleEmptyDrop}
					>
						Drop here or add content below
					</div>
				{:else}
					{#each node.children as child (child.id)}
						<TreeNodeSelf
							node={child}
							depth={depth + 1}
							parentSectionId={node.id}
							{isGenerating}
							{onToggle}
							{onSetLabel}
							{onSetDesc}
							{onEdit}
							{onDelete}
							{onAddContent}
							{onAddSubSection}
							{onAddAbove}
							{onAddBelow}
							{onGenerate}
							{onDrop}
							{onCopy}
							{onSaveSnippet}
						/>
					{/each}
				{/if}

				<!-- Add content/section buttons -->
				<div class="flex flex-wrap gap-2 pt-1">
					{#each CONTENT_TYPES as [type, label]}
						<button
							onclick={(e) => { e.stopPropagation(); onAddContent(node.id, type); }}
							class="text-[11px] px-2 py-1 rounded border border-surface-200 bg-white cursor-pointer text-surface-600 hover:bg-surface-100 flex items-center gap-1"
						>
							+ {label}
						</button>
					{/each}
					<button
						onclick={(e) => { e.stopPropagation(); onAddSubSection(node.id); }}
						class="text-[11px] px-2 py-1 rounded border border-surface-200 bg-white cursor-pointer text-surface-600 hover:bg-surface-100 flex items-center gap-1"
					>
						+ Section
					</button>
				</div>
			</div>
		{/if}
	</div>

	{#if effectiveDropZone === 'after'}
		<div class="absolute inset-x-0 -bottom-[3px] h-[3px] bg-primary-500 rounded z-10 pointer-events-none"></div>
	{/if}
</div>

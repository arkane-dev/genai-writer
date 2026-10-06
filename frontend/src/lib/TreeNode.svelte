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
	import { CONTENT_TYPE_ICONS, CONTENT_TYPE_TONES, CONTENT_TYPE_LABELS } from '$lib/generation';
	import { Tag } from '@cyberpunk-apps/neondeck';
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
		['text_block', 'Text'],
		['image', 'Image'],
		['code', 'Code'],
		['equation', 'Equation'],
		['table', 'Table'],
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

</script>

<div class="node-wrap" data-tree-node-id={node.id} data-node-is-section={isSection(node) ? 'true' : 'false'}>
	{#if effectiveDropZone === 'before'}<div class="drop-line before"></div>{/if}

	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={nodeEl}
		draggable="true"
		class="node"
		class:section={isSection(node)}
		class:drop-inside={effectiveDropZone === 'inside'}
		ondragstart={onDragStart}
		ondragend={onDragEnd}
	>
		<!-- Header row: drag and touch target (keeps parent indicators from bleeding into children) -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={headerEl}
			class="tree-node-header head"
			ondragover={onDragOver}
			ondragleave={onDragLeave}
			ondrop={handleDrop}
			ontouchstart={onHeaderTouchStart}
			ontouchmove={onHeaderTouchMove}
			ontouchend={onHeaderTouchEnd}
		>
			{#if isSection(node)}
				<button
					onclick={(e) => { e.stopPropagation(); onToggle(node.id); }}
					class="toggle"
					class:open={node.open}
					aria-expanded={node.open}
					aria-label="{node.open ? 'Collapse' : 'Expand'} {node.label}"
				>
					<ChevronRightIcon size={14} />
				</button>
			{:else}
				<span class="glyph" aria-hidden="true">{CONTENT_TYPE_ICONS[node.type] ?? '?'}</span>
			{/if}

			<div class="text">
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="label"
					contenteditable="true"
					spellcheck="false"
					role="textbox"
					aria-label="{isSection(node) ? 'Section' : CONTENT_TYPE_LABELS[node.type]} name"
					tabindex="0"
					oninput={(e) => onSetLabel(node.id, (e.currentTarget as HTMLElement).textContent ?? '')}
					onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); } }}
					onmousedown={(e) => e.stopPropagation()}
				>{node.label}</div>

				{#if !isSection(node) && (node.generated_content || node.content)}
					{#if node.type === 'equation'}
						<div class="desc eq">
							{@html renderToString(node.generated_content || node.content, { throwOnError: false })}
						</div>
					{:else}
						<p class="desc">{((node.generated_content || node.content) ?? '').slice(0, 100)}</p>
					{/if}
				{:else}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="desc"
						contenteditable="true"
						spellcheck="false"
						role="textbox"
						aria-label="Short description"
						tabindex="0"
						data-placeholder="add a short description"
						oninput={(e) => onSetDesc(node.id, (e.currentTarget as HTMLElement).textContent ?? '')}
						onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLElement).blur(); } }}
						onmousedown={(e) => e.stopPropagation()}
					>{node.desc}</div>
				{/if}

				{#if !isSection(node) && node.type === 'image' && node.imageUrl}
					<img src={node.imageUrl} alt={node.altText || ''} class="thumb" />
				{/if}
			</div>

			{#if isSection(node)}
				<Tag tone="info">section</Tag>
			{:else}
				<Tag tone={CONTENT_TYPE_TONES[node.type] ?? 'muted'}>{CONTENT_TYPE_LABELS[node.type] ?? node.type}</Tag>
			{/if}

			{#if !isSection(node)}
				<button
					onclick={(e) => { e.stopPropagation(); onGenerate(node, parentSectionId); }}
					disabled={isGenerating}
					class="act gen"
					title="Regenerate"
					aria-label="Regenerate {node.label}"
				>
					<SparklesIcon size={14} />
				</button>
			{/if}

			<!-- Row actions: shown on hover or keyboard focus -->
			<div class="acts">
				<button onclick={(e) => { e.stopPropagation(); onEdit(node, parentSectionId); }} class="act" title="Edit" aria-label="Edit {node.label}">
					<PencilIcon size={14} />
				</button>
				{#if isSection(node)}
					<button onclick={(e) => { e.stopPropagation(); onAddAbove(node.id); }} class="act" title="Add section above" aria-label="Add section above">
						<ArrowUpIcon size={14} />
					</button>
					<button onclick={(e) => { e.stopPropagation(); onAddBelow(node.id); }} class="act" title="Add section below" aria-label="Add section below">
						<ArrowDownIcon size={14} />
					</button>
					<button onclick={(e) => { e.stopPropagation(); onGenerate(node, parentSectionId); }} disabled={isGenerating} class="act gen" title="Generate section" aria-label="Generate {node.label}">
						<SparklesIcon size={14} />
					</button>
				{/if}
				{#if isSection(node) && onCopy}
					<button onclick={(e) => { e.stopPropagation(); onCopy!(node); }} class="act" title="Copy section" aria-label="Copy {node.label}">
						<CopyIcon size={14} />
					</button>
				{/if}
				{#if isSection(node) && onSaveSnippet}
					<button onclick={(e) => { e.stopPropagation(); onSaveSnippet!(node); }} class="act" title="Save as snippet" aria-label="Save {node.label} as snippet">
						<BookmarkPlusIcon size={14} />
					</button>
				{/if}
				<button onclick={(e) => { e.stopPropagation(); onDelete(node.id); }} class="act del" title="Delete" aria-label="Delete {node.label}">
					<Trash2Icon size={14} />
				</button>
			</div>
		</div>

		{#if isSection(node) && node.open}
			<div class="kids">
				{#if node.children.length === 0}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="empty nd-hatch" ondragover={handleEmptyDragOver} ondrop={handleEmptyDrop}>
						<span class="nd-meta">drop here, or add content below</span>
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

				<div class="adds">
					{#each CONTENT_TYPES as [type, label]}
						<button onclick={(e) => { e.stopPropagation(); onAddContent(node.id, type); }} class="add">+ {label}</button>
					{/each}
					<button onclick={(e) => { e.stopPropagation(); onAddSubSection(node.id); }} class="add">+ Section</button>
				</div>
			</div>
		{/if}
	</div>

	{#if effectiveDropZone === 'after'}<div class="drop-line after"></div>{/if}
</div>

<style>
	.node-wrap { position: relative; }
	.drop-line { position: absolute; right: 0; left: 0; z-index: 10; height: 2px; background: var(--nd-accent); box-shadow: var(--nd-glow-accent); pointer-events: none; }
	.drop-line.before { top: -3px; }
	.drop-line.after { bottom: -3px; }

	.node { border: 1px solid var(--nd-line); background: var(--nd-surface-1); transition: border-color var(--nd-dur-fast) var(--nd-ease); }
	.node.section { border-color: var(--nd-line-strong); background: var(--nd-bg); }
	.node.drop-inside { border-color: var(--nd-accent); }

	.head {
		display: flex;
		align-items: center;
		gap: var(--nd-space-2);
		padding: var(--nd-space-2) var(--nd-space-3);
		cursor: grab;
		user-select: none;
	}
	.head:active { cursor: grabbing; }
	.section > .head { border-left: 2px solid var(--nd-accent); }

	.toggle {
		display: grid;
		place-items: center;
		flex: none;
		width: 1.5rem;
		height: 1.5rem;
		border: 0;
		background: transparent;
		color: var(--nd-accent);
		cursor: pointer;
		transition: transform var(--nd-dur-fast) var(--nd-ease);
	}
	.toggle.open { transform: rotate(90deg); }
	.glyph { flex: none; width: 1.75rem; font-family: var(--nd-font-mono); font-size: var(--nd-text-2xs); color: var(--nd-text-mute); text-align: center; }

	.text { flex: 1; min-width: 0; }
	/* Editable text is a click target: keep it at least 24px tall (WCAG 2.5.8). */
	.label {
		min-height: 24px;
		line-height: 24px;
		overflow: hidden;
		font-family: var(--nd-font-ui);
		font-size: var(--nd-text-md);
		font-weight: 600;
		letter-spacing: 0.04em;
		white-space: nowrap;
		text-overflow: ellipsis;
		outline: none;
		cursor: text;
	}
	.section > .head .label { text-transform: uppercase; letter-spacing: var(--nd-tracking-label); }
	.desc {
		min-height: 24px;
		line-height: 24px;
		margin: 0;
		overflow: hidden;
		color: var(--nd-text-dim);
		font-size: var(--nd-text-xs);
		white-space: nowrap;
		text-overflow: ellipsis;
		outline: none;
	}
	.desc[contenteditable]:empty::before { content: attr(data-placeholder); color: var(--nd-text-mute); }
	.label:focus-visible, .desc:focus-visible { outline: 1px solid var(--nd-focus); outline-offset: 2px; }
	.desc.eq { white-space: normal; }
	.thumb { max-height: 2.5rem; margin-top: var(--nd-space-1); border: 1px solid var(--nd-line); }

	.act {
		display: grid;
		place-items: center;
		width: 1.75rem;
		height: 1.75rem;
		border: 0;
		background: transparent;
		color: var(--nd-text-mute);
		cursor: pointer;
	}
	.act:hover:not(:disabled) { background: var(--nd-surface-2); color: var(--nd-text); }
	.act.gen:hover:not(:disabled) { color: var(--nd-accent); }
	.act.del:hover { color: var(--nd-danger); }
	.act:disabled { color: var(--nd-line-strong); cursor: not-allowed; }
	.acts { display: flex; opacity: 0; transition: opacity var(--nd-dur-fast) var(--nd-ease); }
	.head:hover .acts, .head:focus-within .acts { opacity: 1; }

	.kids { display: flex; flex-direction: column; gap: var(--nd-space-2); padding: 0 var(--nd-space-2) var(--nd-space-2) var(--nd-space-6); }
	.empty { display: grid; place-items: center; min-height: 2.25rem; border: 1px solid var(--nd-line); }
	.adds { display: flex; flex-wrap: wrap; gap: var(--nd-space-1); padding-top: var(--nd-space-1); }
	.add {
		min-height: 24px;
		padding: 0.2em 0.6em;
		border: 1px solid var(--nd-line);
		background: transparent;
		color: var(--nd-text-dim);
		font-family: var(--nd-font-ui);
		font-size: var(--nd-text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.add:hover { border-color: var(--nd-accent); color: var(--nd-accent); }
</style>

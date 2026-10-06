<script lang="ts">
	import { ChevronRightIcon } from '@lucide/svelte';
	import { Dialog, Button, Tag } from '@cyberpunk-apps/neondeck';
	import { store, library, type Snapshot } from '$lib/platform/store.svelte';
	import { diffTrees, formatTimestamp, relativeTime, formatDiffValue, type DiffEntry } from './history';

	let {
		currentSnapshotId,
		documentId,
		onRestore,
		onClose,
	}: {
		currentSnapshotId: number | null;
		documentId: number;
		onRestore: (snapshot: Snapshot) => void;
		onClose: () => void;
	} = $props();

	let snapshots: Snapshot[] = $state([]);
	let expandedId: number | null = $state(null);
	let open = $state(true);

	$effect(() => {
		const docId = documentId; // capture for reactive tracking
		void library.version; // re-read after every write
		let stale = false;
		store.listSnapshots(docId).then((arr) => { if (!stale) snapshots = arr.reverse(); });
		return () => { stale = true; };
	});

	function getDiff(snapshot: Snapshot, index: number): DiffEntry[] {
		const prev = snapshots[index + 1]; // list is newest-first
		if (!prev) return [];
		try {
			return diffTrees(JSON.parse(prev.tree), JSON.parse(snapshot.tree));
		} catch {
			return [];
		}
	}

	function toggleExpand(id: number) {
		expandedId = expandedId === id ? null : id;
	}
</script>

<Dialog bind:open title="History" placement="right" size="md" meta="{snapshots.length} snapshot{snapshots.length === 1 ? '' : 's'}" onclose={onClose}>
	{#if snapshots.length === 0}
		<p class="nd-meta">&gt; no history yet</p>
	{:else}
		<ol class="timeline">
			{#each snapshots as snapshot, i (snapshot.id)}
				{@const isCurrent = snapshot.id === currentSnapshotId}
				{@const isExpanded = expandedId === snapshot.id}
				{@const diffs = isExpanded ? getDiff(snapshot, i) : []}
				<li class:current={isCurrent}>
					<span class="dot" aria-hidden="true"></span>
					<div class="row">
						<button
							class="toggle"
							class:open={isExpanded}
							onclick={() => toggleExpand(snapshot.id!)}
							aria-expanded={isExpanded}
							aria-label="Show changes in “{snapshot.message}”"
						>
							<ChevronRightIcon size={14} />
						</button>
						<div class="what">
							<p class="msg">{snapshot.message}</p>
							<p class="nd-meta" title={formatTimestamp(snapshot.timestamp)}>{relativeTime(snapshot.timestamp)} · {formatTimestamp(snapshot.timestamp)}</p>
						</div>
						{#if isCurrent}
							<Tag tone="success" dot>current</Tag>
						{:else}
							<Button size="sm" variant="outline" onclick={() => onRestore(snapshot)} title="Restore the document to this state">Restore</Button>
						{/if}
					</div>

					{#if isExpanded}
						<div class="diffs">
							{#if diffs.length === 0}
								<p class="nd-meta">&gt; first snapshot, nothing to compare</p>
							{:else}
								{#each diffs as diff, j (j)}
									<div class="diff {diff.type}">
										{#if diff.type === 'added'}
											<b>+</b> [{diff.nodeType.replace('_', ' ')}] "{diff.nodeLabel}"
										{:else if diff.type === 'removed'}
											<b>−</b> [{diff.nodeType.replace('_', ' ')}] "{diff.nodeLabel}"
										{:else}
											<b>~</b> "{diff.nodeLabel}" › {diff.field?.replace(/_/g, ' ')}
											<div class="old">− {formatDiffValue(diff.oldValue)}</div>
											<div class="new">+ {formatDiffValue(diff.newValue)}</div>
										{/if}
									</div>
								{/each}
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</Dialog>

<style>
	.timeline { position: relative; margin: 0; padding: 0 0 0 var(--nd-space-5); list-style: none; border-left: 1px solid var(--nd-line-strong); }
	li { position: relative; padding: var(--nd-space-2) 0 var(--nd-space-3); border-bottom: 1px solid var(--nd-line); }
	.dot { position: absolute; top: 0.95rem; left: calc(var(--nd-space-5) * -1 - 4px); width: 7px; height: 7px; background: var(--nd-line-strong); }
	.current .dot { background: var(--nd-success); box-shadow: 0 0 6px var(--nd-success); }
	.row { display: flex; align-items: flex-start; gap: var(--nd-space-2); }
	.toggle {
		display: grid;
		place-items: center;
		flex: none;
		width: 1.5rem;
		height: 1.5rem;
		border: 0;
		background: transparent;
		color: var(--nd-text-mute);
		cursor: pointer;
		transition: transform var(--nd-dur-fast) var(--nd-ease);
	}
	.toggle:hover { color: var(--nd-text); }
	.toggle.open { transform: rotate(90deg); color: var(--nd-accent); }
	.what { flex: 1; min-width: 0; }
	.msg { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--nd-text-sm); }
	.what .nd-meta { margin: 0; }
	.diffs { display: flex; flex-direction: column; gap: var(--nd-space-1); margin: var(--nd-space-2) 0 0 var(--nd-space-6); }
	.diff { padding: var(--nd-space-1) var(--nd-space-2); font-family: var(--nd-font-mono); font-size: var(--nd-text-xs); overflow-wrap: anywhere; border-left: 2px solid var(--t); background: color-mix(in srgb, var(--t) 8%, transparent); }
	.diff.added { --t: var(--nd-success); }
	.diff.removed { --t: var(--nd-danger); }
	.diff.changed { --t: var(--nd-warning); }
	.diff b { color: var(--t); }
	.old { padding-left: var(--nd-space-3); color: var(--nd-danger); }
	.new { padding-left: var(--nd-space-3); color: var(--nd-success); }
</style>

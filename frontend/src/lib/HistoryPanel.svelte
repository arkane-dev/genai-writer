<script lang="ts">
	import { XIcon, RotateCcwIcon, ChevronDownIcon, ChevronRightIcon } from '@lucide/svelte';
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

<!-- Backdrop -->
<div
	class="fixed inset-0 z-40 flex justify-end"
	role="dialog"
	aria-modal="true"
	aria-label="Document history"
>
	<div class="flex-1 bg-black/20" onclick={onClose} role="presentation"></div>

	<!-- Panel -->
	<div class="flex h-full w-[500px] flex-col bg-white shadow-2xl">
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-surface-200 px-4 py-3">
			<h2 class="text-base font-semibold">Document History</h2>
			<button class="btn-icon preset-outlined" onclick={onClose}>
				<XIcon class="h-4 w-4" />
			</button>
		</div>

		<!-- Timeline -->
		<div class="flex-1 overflow-auto">
			{#if snapshots.length === 0}
				<p class="p-6 text-sm italic text-surface-400">No history yet.</p>
			{:else}
				<ol class="relative border-l border-surface-200 ml-5 my-4 mr-4 space-y-1">
					{#each snapshots as snapshot, i (snapshot.id)}
						{@const isCurrent = snapshot.id === currentSnapshotId}
						{@const isExpanded = expandedId === snapshot.id}
						{@const diffs = isExpanded ? getDiff(snapshot, i) : []}

						<li class="ml-4">
							<!-- Timeline dot -->
							<div
								class="absolute -left-1.5 mt-2 h-3 w-3 rounded-full border-2 border-white {isCurrent
									? 'bg-primary-500'
									: 'bg-surface-300'}"
							></div>

							<div
								class="rounded-lg border p-3 transition-colors {isCurrent
									? 'border-primary-200 bg-primary-50'
									: 'border-surface-100 bg-white hover:border-surface-200 hover:bg-surface-50'}"
							>
								<!-- Row: expand toggle + message + restore -->
								<div class="flex items-start gap-2">
									<button
										class="mt-0.5 flex-shrink-0 text-surface-400 hover:text-surface-700"
										onclick={() => toggleExpand(snapshot.id!)}
										aria-label="Toggle diff"
									>
										{#if isExpanded}
											<ChevronDownIcon class="h-4 w-4" />
										{:else}
											<ChevronRightIcon class="h-4 w-4" />
										{/if}
									</button>

									<div class="min-w-0 flex-1">
										<p class="truncate text-sm font-medium text-surface-800">
											{snapshot.message}
											{#if isCurrent}
												<span class="ml-2 text-xs font-normal text-primary-600">● current</span>
											{/if}
										</p>
										<p class="mt-0.5 text-xs text-surface-400" title={formatTimestamp(snapshot.timestamp)}>
											{relativeTime(snapshot.timestamp)} · {formatTimestamp(snapshot.timestamp)}
										</p>
									</div>

									<button
										class="flex flex-shrink-0 items-center gap-1 rounded border border-surface-200 bg-white px-2 py-1 text-xs text-surface-600 hover:border-primary-300 hover:bg-primary-50 hover:text-primary-700"
										onclick={() => onRestore(snapshot)}
										title="Restore document to this state"
									>
										<RotateCcwIcon class="h-3 w-3" /> Restore
									</button>
								</div>

								<!-- Diff entries -->
								{#if isExpanded}
									<div class="ml-6 mt-2 space-y-1">
										{#if diffs.length === 0}
											<p class="text-xs italic text-surface-400">Initial snapshot — no previous state to compare.</p>
										{:else}
											{#each diffs as diff}
												<div
													class="rounded px-2 py-1.5 font-mono text-xs {diff.type === 'added'
														? 'bg-green-50 text-green-800'
														: diff.type === 'removed'
															? 'bg-red-50 text-red-800'
															: 'bg-amber-50 text-amber-800'}"
												>
													{#if diff.type === 'added'}
														<span class="font-semibold">+</span>
														[{diff.nodeType.replace('_', ' ')}] "{diff.nodeLabel}"
													{:else if diff.type === 'removed'}
														<span class="font-semibold">−</span>
														[{diff.nodeType.replace('_', ' ')}] "{diff.nodeLabel}"
													{:else}
														<span class="font-semibold">~</span>
														"{diff.nodeLabel}" › {diff.field?.replace(/_/g, ' ')}
														<div class="mt-1 break-all pl-3 text-red-700">
															− {formatDiffValue(diff.oldValue)}
														</div>
														<div class="break-all pl-3 text-green-700">
															+ {formatDiffValue(diff.newValue)}
														</div>
													{/if}
												</div>
											{/each}
										{/if}
									</div>
								{/if}
							</div>
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	</div>
</div>

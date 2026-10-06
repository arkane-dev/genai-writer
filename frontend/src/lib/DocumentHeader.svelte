<script lang="ts">
	import { SettingsIcon, FileTextIcon } from '@lucide/svelte';
	import { fade } from 'svelte/transition';
	import type { DocumentOptions } from '$lib/types';

	let {
		documentTitle = $bindable(''),
		documentOptions = $bindable<DocumentOptions>({
			generateExecutiveSummary: false,
			generateIntroduction: false,
			generateConclusion: false,
			generateReferences: false,
		}),
		showOptions = $bindable(false),
	} = $props();

	function getActiveOptionsCount(): number {
		return Object.values(documentOptions).filter((v) => v).length;
	}
</script>

<div class="bg-white rounded-xl shadow-sm border border-surface-200 p-6 mb-6">
	<div class="flex items-start gap-4">
		<div class="flex-1">
			<label for="docTitle" class="label pb-2">
				<span class="label-text font-semibold text-surface-700">Document Title</span>
			</label>
			<input
				id="docTitle"
				class="input h-12 text-lg font-medium"
				type="text"
				placeholder="Enter your document title..."
				bind:value={documentTitle}
			/>
		</div>
		<button
			class="btn preset-outlined mt-6"
			onclick={() => (showOptions = !showOptions)}
			class:btn-active={showOptions}
		>
			<SettingsIcon class="w-4 h-4" />
			Options
			{#if getActiveOptionsCount() > 0}
				<span class="badge preset-filled-primary-500 ml-2">{getActiveOptionsCount()}</span>
			{/if}
		</button>
	</div>

	{#if showOptions}
		<div in:fade={{ duration: 200 }} class="mt-4 pt-4 border-t border-surface-200">
			<h3 class="text-sm font-semibold text-surface-600 mb-3 flex items-center gap-2">
				<FileTextIcon class="w-4 h-4" />
				Generation Options
			</h3>
			<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
				<label class="flex items-center gap-3 p-3 rounded-lg bg-surface-50 hover:bg-surface-100 transition-colors cursor-pointer">
					<input class="checkbox checkbox-sm" type="checkbox" bind:checked={documentOptions.generateExecutiveSummary} />
					<div>
						<p class="text-sm font-medium">Executive Summary</p>
						<p class="text-xs text-surface-500">Generate a concise overview</p>
					</div>
				</label>
				<label class="flex items-center gap-3 p-3 rounded-lg bg-surface-50 hover:bg-surface-100 transition-colors cursor-pointer">
					<input class="checkbox checkbox-sm" type="checkbox" bind:checked={documentOptions.generateIntroduction} />
					<div>
						<p class="text-sm font-medium">Introduction</p>
						<p class="text-xs text-surface-500">Add document intro section</p>
					</div>
				</label>
				<label class="flex items-center gap-3 p-3 rounded-lg bg-surface-50 hover:bg-surface-100 transition-colors cursor-pointer">
					<input class="checkbox checkbox-sm" type="checkbox" bind:checked={documentOptions.generateConclusion} />
					<div>
						<p class="text-sm font-medium">Conclusion</p>
						<p class="text-xs text-surface-500">Add concluding section</p>
					</div>
				</label>
				<label class="flex items-center gap-3 p-3 rounded-lg bg-surface-50 hover:bg-surface-100 transition-colors cursor-pointer">
					<input class="checkbox checkbox-sm" type="checkbox" bind:checked={documentOptions.generateReferences} />
					<div>
						<p class="text-sm font-medium">References</p>
						<p class="text-xs text-surface-500">Compile all references</p>
					</div>
				</label>
			</div>
		</div>
	{/if}
</div>

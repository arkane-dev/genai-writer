<script lang="ts">
	import { Panel, Input, Button, Checkbox, Tag } from '@cyberpunk-apps/neondeck';
	import type { DocumentOptions } from '$lib/types';

	let {
		documentTitle = $bindable(''),
		documentOptions = $bindable<DocumentOptions>({
			generateExecutiveSummary: false,
			generateIntroduction: false,
			generateConclusion: false,
			generateReferences: false
		}),
		showOptions = $bindable(false)
	} = $props();

	const activeCount = $derived(Object.values(documentOptions).filter(Boolean).length);
</script>

<Panel title="Document" index="01" meta="{activeCount} extra section{activeCount === 1 ? '' : 's'}">
	<div class="head">
		<div class="title">
			<Input label="Title" placeholder="Name the document" bind:value={documentTitle} />
		</div>
		<Button variant="outline" onclick={() => (showOptions = !showOptions)} aria-expanded={showOptions}>
			Options
			{#if activeCount > 0}<Tag solid>{activeCount}</Tag>{/if}
		</Button>
	</div>

	{#if showOptions}
		<div class="opts">
			<p class="nd-label">Generate extra sections</p>
			<div class="grid">
				<Checkbox label="Executive summary" hint="A short overview of the whole document" bind:checked={documentOptions.generateExecutiveSummary} />
				<Checkbox label="Introduction" hint="An opening section" bind:checked={documentOptions.generateIntroduction} />
				<Checkbox label="Conclusion" hint="A closing section" bind:checked={documentOptions.generateConclusion} />
				<Checkbox label="References" hint="Every reference, collected in one list" bind:checked={documentOptions.generateReferences} />
			</div>
		</div>
	{/if}
</Panel>

<style>
	.head { display: flex; align-items: flex-end; gap: var(--nd-space-4); }
	.title { flex: 1; min-width: 0; }
	.opts { margin-top: var(--nd-space-4); padding-top: var(--nd-space-4); border-top: 1px solid var(--nd-line); }
	.grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--nd-space-4); margin-top: var(--nd-space-3); }
	@media (max-width: 720px) {
		.grid { grid-template-columns: 1fr; }
	}
</style>

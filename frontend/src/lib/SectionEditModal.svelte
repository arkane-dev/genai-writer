<script lang="ts">
	import { untrack } from 'svelte';
	import { Dialog, Tabs, Input, Textarea, Select, FileDrop, Button } from '@cyberpunk-apps/neondeck';
	import type { TreeNode, StoredAttachment } from '$lib/types';
	import { ACCEPTED_ATTACHMENT_TYPES, extractFileText } from '$lib/contextExtractor';
	import AttachmentList from '$lib/AttachmentList.svelte';

	let { section, onClose }: { section: TreeNode; onClose: (data: Partial<TreeNode> | null) => void } = $props();

	let activeTab = $state('details');
	let open = $state(true);

	// untrack() marks each read as an intentional one-time initialisation.
	// The modal always mounts fresh (parent uses {#if editingSection}), so no resync effect is needed.
	let localLabel = $state(untrack(() => section.label));
	let localDesc = $state(untrack(() => section.desc));
	let localDescription = $state(untrack(() => section.description));
	let localPurpose = $state(untrack(() => section.purpose));
	let localKeyPoints = $state(untrack(() => section.key_points));
	let localConclusion = $state(untrack(() => section.conclusion));
	let localAdditionalDetails = $state(untrack(() => section.additional_details));
	let referencesText = $state(untrack(() => section.references?.join('\n') ?? ''));
	let localType = $state(untrack(() => section.type));
	const hasChildren = untrack(() => (section.children?.length ?? 0) > 0);
	let attachments = $state<StoredAttachment[]>(untrack(() => [...(section.storedAttachments ?? [])]));
	let reading = $state(0);

	// Text is pulled out on upload, so it survives reloads and feeds generation as context.
	async function addFiles(files: File[]) {
		reading += files.length;
		for (const f of files) {
			try {
				const text = await extractFileText(f);
				attachments = [...attachments.filter((a) => a.name !== f.name), { name: f.name, text }];
			} finally {
				reading--;
			}
		}
	}

	function handleSave() {
		onClose({
			type: localType as TreeNode['type'],
			label: localLabel,
			desc: localDesc,
			description: localDescription,
			purpose: localPurpose,
			key_points: localKeyPoints,
			conclusion: localConclusion,
			additional_details: localAdditionalDetails,
			references: referencesText.split('\n').filter((r) => r.trim()),
			storedAttachments: attachments,
		});
	}

	function handleCancel() {
		onClose(null);
	}
</script>

<Dialog bind:open title="Edit section" index="02" meta={section.id} size="lg" onclose={() => onClose(null)}>
	<Tabs label="Section editor" items={[{ value: 'details', label: 'Details' }, { value: 'output', label: 'Output' }]} bind:value={activeTab}>
		{#snippet children(tab)}
			{#if tab === 'details'}
				<div class="form">
					{#if !hasChildren}
						<Select
							label="Type"
							bind:value={localType}
							options={[
								{ value: 'section', label: 'Section' },
								{ value: 'text_block', label: 'Text block' },
								{ value: 'image', label: 'Image' },
								{ value: 'code', label: 'Code' },
								{ value: 'equation', label: 'Equation' },
								{ value: 'table', label: 'Table' }
							]}
						/>
					{:else}
						<p class="nd-meta">&gt; type is locked while the section has children</p>
					{/if}
					<div class="two">
						<Input label="Section title" bind:value={localLabel} />
						<Input label="Short description" bind:value={localDesc} placeholder="Subtitle shown in the tree" />
					</div>
					<Textarea label="Description" rows={3} bind:value={localDescription} placeholder="What this section is about" />
					<Textarea label="Purpose" rows={2} bind:value={localPurpose} placeholder="What this section is for" />
					<Textarea label="Key points" rows={2} bind:value={localKeyPoints} placeholder="The points it must cover" />
					<Textarea label="Conclusion" rows={2} bind:value={localConclusion} placeholder="The conclusion it should reach" />
					<Textarea label="Additional details" rows={2} bind:value={localAdditionalDetails} placeholder="Directions, data or anything else the writer needs" />
					<Textarea label="References (one per line)" rows={3} mono bind:value={referencesText} placeholder="https://…" />
					<div>
						<FileDrop
							label="Attach files"
							hint="md · txt · docx · odt · pdf. The text is used as background when generating."
							accept={ACCEPTED_ATTACHMENT_TYPES}
							multiple
							onfiles={addFiles}
						/>
						<AttachmentList bind:attachments {reading} />
					</div>
				</div>
			{:else if section.generated_content}
				<pre class="output">{section.generated_content}</pre>
			{:else}
				<p class="nd-meta">&gt; no output yet. Use the generate button in the tree.</p>
			{/if}
		{/snippet}
	</Tabs>
	{#snippet footer()}
		<Button variant="ghost" onclick={handleCancel}>Cancel</Button>
		<Button onclick={handleSave}>Save</Button>
	{/snippet}
</Dialog>

<style>
	.form { display: flex; flex-direction: column; gap: var(--nd-space-4); }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: var(--nd-space-4); }
	.output { white-space: pre-wrap; font-family: var(--nd-font-body); color: var(--nd-text); }
	@media (max-width: 720px) { .two { grid-template-columns: 1fr; } }
</style>

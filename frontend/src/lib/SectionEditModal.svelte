<script lang="ts">
	import { untrack } from 'svelte';
	import { FileIcon, XIcon } from '@lucide/svelte';
	import { FileUpload, Tabs, Dialog } from '@skeletonlabs/skeleton-svelte';
	import type { TreeNode } from '$lib/types';
	import { ACCEPTED_ATTACHMENT_TYPES } from '$lib/contextExtractor';

	let { section, onClose }: { section: TreeNode; onClose: (data: Partial<TreeNode> | null) => void } = $props();

	let activeTab = $state('details');

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
		});
	}

	function handleCancel() {
		onClose(null);
	}
</script>

<Dialog
	open={true}
	onOpenChange={(e) => { if (!e.open) onClose(null); }}
>
	<Dialog.Backdrop class="fixed inset-0 bg-black/50 backdrop-blur-sm z-40" />
	<Dialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<Dialog.Content class="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
			<div class="p-6 space-y-4">
				<div class="flex items-center justify-between">
					<Dialog.Title class="h2">Edit Section</Dialog.Title>
					<Dialog.CloseTrigger class="btn-icon preset-outlined"><XIcon class="size-4" /></Dialog.CloseTrigger>
				</div>

				<Tabs value={activeTab} onValueChange={(e) => { activeTab = e.value; }}>
					<Tabs.List class="flex border-b border-surface-200 mb-2">
						<Tabs.Trigger
							value="details"
							class="px-4 py-2 text-sm font-medium text-surface-500 hover:text-surface-900 data-[selected]:border-b-2 data-[selected]:border-primary-500 data-[selected]:text-primary-600"
						>
							Details
						</Tabs.Trigger>
						<Tabs.Trigger
							value="output"
							class="px-4 py-2 text-sm font-medium text-surface-500 hover:text-surface-900 data-[selected]:border-b-2 data-[selected]:border-primary-500 data-[selected]:text-primary-600"
						>
							Output
						</Tabs.Trigger>
					</Tabs.List>

					<Tabs.Content value="details" class="space-y-4 pt-2">
						{#if !hasChildren}
							<label class="label">
								<span class="label-text">Type</span>
								<select class="select w-full" bind:value={localType}>
									<option value="section">Section</option>
									<option value="text_block">Text Block</option>
									<option value="image">Image</option>
									<option value="code">Code</option>
									<option value="equation">Equation</option>
								</select>
							</label>
						{:else}
							<p class="text-xs text-surface-400 italic">Type cannot be changed while the section has child items.</p>
						{/if}

						<label class="label">
							<span class="label-text">Section Title</span>
							<input class="input" type="text" bind:value={localLabel} />
						</label>

						<label class="label">
							<span class="label-text">Short Description</span>
							<input class="input" type="text" bind:value={localDesc} placeholder="Brief subtitle shown in the tree" />
						</label>

						<label class="label">
							<span class="label-text">Description</span>
							<textarea class="textarea rounded-container" rows="3" bind:value={localDescription} placeholder="High level description of section"></textarea>
						</label>

						<label class="label">
							<span class="label-text">Purpose</span>
							<textarea class="textarea rounded-container" rows="2" bind:value={localPurpose} placeholder="What is the purpose of this section"></textarea>
						</label>

						<label class="label">
							<span class="label-text">Key Points</span>
							<textarea class="textarea rounded-container" rows="2" bind:value={localKeyPoints} placeholder="What key points should be covered"></textarea>
						</label>

						<label class="label">
							<span class="label-text">Conclusion</span>
							<textarea class="textarea rounded-container" rows="2" bind:value={localConclusion} placeholder="What conclusion should be drawn"></textarea>
						</label>

						<label class="label">
							<span class="label-text">Additional Details</span>
							<textarea class="textarea rounded-container" rows="2" bind:value={localAdditionalDetails} placeholder="Provide any additional details, directions, or supporting data"></textarea>
						</label>

						<label class="label">
							<span class="label-text">References (one per line)</span>
							<textarea class="textarea rounded-container" rows="3" bind:value={referencesText} placeholder="Enter references (one per line)"></textarea>
						</label>

						<label class="label">
							<span class="label-text">Attachments</span>
							<FileUpload>
								<FileUpload.Label>Upload your files</FileUpload.Label>
								<FileUpload.Dropzone>
									<FileIcon class="size-10" />
									<span>Select file or drag here.</span>
									<FileUpload.Trigger>Browse Files</FileUpload.Trigger>
									<FileUpload.HiddenInput accept={ACCEPTED_ATTACHMENT_TYPES} />
								</FileUpload.Dropzone>
								<FileUpload.ItemGroup>
									<FileUpload.Context>
										{#snippet children(fileUpload)}
											{#each fileUpload().acceptedFiles as file (file.name)}
												<FileUpload.Item {file}>
													<FileUpload.ItemName>{file.name}</FileUpload.ItemName>
													<FileUpload.ItemSizeText>{file.size} bytes</FileUpload.ItemSizeText>
													<FileUpload.ItemDeleteTrigger />
												</FileUpload.Item>
											{/each}
										{/snippet}
									</FileUpload.Context>
								</FileUpload.ItemGroup>
								<FileUpload.ClearTrigger>Clear Files</FileUpload.ClearTrigger>
							</FileUpload>
						</label>
					</Tabs.Content>

					<Tabs.Content value="output" class="pt-2">
						{#if section.generated_content}
							<div class="rounded-lg border border-surface-200 bg-surface-50 p-4">
								<p class="whitespace-pre-wrap text-sm">{section.generated_content}</p>
							</div>
						{:else}
							<p class="text-sm text-surface-400 italic p-4">No generated output yet. Use the generate button in the document tree to generate content for this section.</p>
						{/if}
					</Tabs.Content>
				</Tabs>

				<div class="flex justify-end gap-2 pt-4 border-t border-surface-200">
					<button class="btn preset-outlined" onclick={handleCancel}>Cancel</button>
					<button class="btn preset-filled-primary-500" onclick={handleSave}>Save</button>
				</div>
			</div>
		</Dialog.Content>
	</Dialog.Positioner>
</Dialog>

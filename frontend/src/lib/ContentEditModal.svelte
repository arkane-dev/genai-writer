<script lang="ts">
	import { untrack } from 'svelte';
	import { FileIcon, XIcon } from '@lucide/svelte';
	import { FileUpload, Tabs, Dialog } from '@skeletonlabs/skeleton-svelte';
	import { renderToString } from 'katex';
	import 'katex/dist/katex.min.css';
	import type { TreeNode } from '$lib/types';
	import { buildBackgroundContext, ACCEPTED_ATTACHMENT_TYPES } from '$lib/contextExtractor';
	import { generateItem } from '$lib/generation';
	import { getConfig } from '$lib/config';

	let { sectionId, content, onClose }: { sectionId: string; content: TreeNode; onClose: (data: Partial<TreeNode> | null) => void } = $props();

	let activeTab = $state('details');
	let isGenerating = $state(false);
	// untrack() marks each read as an intentional one-time initialisation, not a reactive subscription.
	// The modal always mounts fresh (parent uses {#if editingContent}), so no resync effect is needed.
	let localType = $state(untrack(() => content.type));

	// Shared
	let localLabel = $state(untrack(() => content.label));

	// text_block
	let localText = $state(untrack(() => content.content ?? ''));
	let textGenerateMode = $state(untrack(() => content.generate ?? false));
	let localParagraphs = $state(untrack(() => content.paragraphs ?? 1));
	const maxParagraphs = getConfig().maxOutputParagraphs;
	let localDescription = $state(untrack(() => content.description ?? ''));
	let localPurpose = $state(untrack(() => content.purpose ?? ''));
	let localKeyPoints = $state(untrack(() => content.key_points ?? ''));
	let localConclusion = $state(untrack(() => content.conclusion ?? ''));
	let localAdditionalDetails = $state(untrack(() => content.additional_details ?? ''));
	let referencesText = $state(untrack(() => content.references?.join('\n') ?? ''));

	// image
	let imageGenerateMode = $state(untrack(() => content.generate ?? false));
	let localImagePrompt = $state(untrack(() => content.content ?? ''));
	let imageAltText = $state(untrack(() => content.altText ?? ''));
	let imageUrlInput = $state(untrack(() => content.imageUrl ?? ''));
	let uploadedImage = $state<File | null>(untrack(() => content.imageFile ?? null));

	// code
	let codeGenerateMode = $state(untrack(() => content.generate ?? false));
	let localCode = $state(untrack(() => content.content ?? ''));

	// equation
	let equationGenerateMode = $state(untrack(() => content.generate ?? false));
	let localEquation = $state(untrack(() => content.content ?? ''));

	// Resync if content identity changes while open
	let currentGenerateMode = $derived(
		localType === 'text_block' ? textGenerateMode :
		localType === 'image' ? imageGenerateMode :
		localType === 'code' ? codeGenerateMode :
		localType === 'equation' ? equationGenerateMode : false
	);

	const CONTENT_TYPE_LABELS: Record<string, string> = {
		text_block: 'Text Block', image: 'Image', code: 'Code', equation: 'Equation',
	};

	async function generateNow() {
		isGenerating = true;
		try {
			// Build a temporary node from current local state so generateItem
			// uses what the user has typed, not the last-saved prop values.
			// This also ensures image nodes go through the SwarmUI path in
			// generation.ts rather than the inline text-LLM call below.
			const tempNode: TreeNode = {
				...content,
				type: localType as TreeNode['type'],
				label: localLabel,
				description: localDescription,
				purpose: localPurpose,
				key_points: localKeyPoints,
				conclusion: localConclusion,
				additional_details: localAdditionalDetails,
				// content field carries the type-specific raw input
				content:
					localType === 'image' ? localImagePrompt :
					localType === 'code' ? localCode :
					localType === 'equation' ? localEquation :
					localText,
			};

			await generateItem(tempNode, null, []);

			// Copy generated fields back to the live content node for display
			content.generated_content = tempNode.generated_content;
			if (tempNode.imageUrl) {
				content.imageUrl = tempNode.imageUrl;
				imageUrlInput = tempNode.imageUrl; // sync so handleSave picks it up
			}
			if (tempNode.altText) content.altText = tempNode.altText;

			activeTab = 'output';
		} catch (error) {
			console.error('Generation error:', error);
		}
		isGenerating = false;
	}

	function handleSave() {
		const base = { label: localLabel, generated_content: content.generated_content ?? null, type: localType as TreeNode['type'] };
		if (localType === 'text_block') {
			onClose({ ...base, content: localText, generate: textGenerateMode,
				paragraphs: localParagraphs,
				description: localDescription, purpose: localPurpose,
				key_points: localKeyPoints, conclusion: localConclusion,
				additional_details: localAdditionalDetails,
				references: referencesText.split('\n').filter((r) => r.trim()) });
		} else if (localType === 'image') {
			onClose({ ...base, generate: imageGenerateMode, content: localImagePrompt,
				altText: imageAltText, imageUrl: imageUrlInput,
				...(uploadedImage ? { imageFile: uploadedImage } : {}) });
		} else if (localType === 'code') {
			onClose({ ...base, generate: codeGenerateMode, content: localCode });
		} else if (localType === 'equation') {
			onClose({ ...base, generate: equationGenerateMode, content: localEquation });
		} else {
			onClose(base);
		}
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
					<Dialog.Title class="h2">Edit {CONTENT_TYPE_LABELS[localType] ?? localType}</Dialog.Title>
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
						<label class="label">
							<span class="label-text">Type</span>
							<select class="select w-full" bind:value={localType}>
								<option value="text_block">Text Block</option>
								<option value="image">Image</option>
								<option value="code">Code</option>
								<option value="equation">Equation</option>
							</select>
						</label>

						{#if localType === 'text_block'}
							<label class="label">
								<span class="label-text">Title</span>
								<input class="input" type="text" bind:value={localLabel} />
							</label>

							<label class="label">
								<span class="label-text">Content</span>
								<div class="space-y-3">
									<div class="flex items-center gap-3 p-3 border border-surface-200 rounded-lg bg-surface-50">
										<span class="flex-1 text-sm font-medium">Generate text</span>
										<label class="relative inline-flex items-center cursor-pointer">
											<input type="checkbox" class="toggle sr-only peer" bind:checked={textGenerateMode} />
											<div class="w-11 h-6 bg-surface-300 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-surface-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500 peer-checked:peer-focus:ring-primary-500"></div>
										</label>
									</div>
									<textarea
										class="textarea rounded-container"
										rows="8"
										bind:value={localText}
										placeholder={textGenerateMode ? 'Describe the text you want generated...' : 'Enter text content...'}
									></textarea>
								</div>
							</label>

							{#if textGenerateMode}
								<label class="label">
									<span class="label-text">Description</span>
									<textarea class="textarea rounded-container" rows="3" bind:value={localDescription} placeholder="High level description of this block"></textarea>
								</label>

								<label class="label">
									<span class="label-text">Purpose</span>
									<textarea class="textarea rounded-container" rows="2" bind:value={localPurpose} placeholder="What is the purpose of this block"></textarea>
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

								<div class="space-y-2">
									<div class="flex items-center justify-between">
										<span class="label-text">Output Length</span>
										<span class="text-sm font-medium text-primary-600">{localParagraphs} {localParagraphs === 1 ? 'paragraph' : 'paragraphs'}</span>
									</div>
									<input
										type="range"
										class="w-full accent-primary-500"
										min="1"
										max={maxParagraphs}
										step="1"
										bind:value={localParagraphs}
									/>
									<div class="flex justify-between text-xs text-surface-400">
										<span>1</span>
										<span>{maxParagraphs}</span>
									</div>
								</div>

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
							{/if}

						{:else if localType === 'image'}
							<div class="space-y-4">
								<div class="flex items-center gap-3 p-3 border border-surface-200 rounded-lg bg-surface-50">
									<span class="flex-1 text-sm font-medium">Generate image</span>
									<label class="relative inline-flex items-center cursor-pointer">
										<input type="checkbox" class="toggle sr-only peer" bind:checked={imageGenerateMode} />
										<div class="w-11 h-6 bg-surface-300 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-surface-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500 peer-checked:peer-focus:ring-primary-500"></div>
									</label>
								</div>
								<label class="label">
									<span class="label-text">Image Name</span>
									<input class="input" type="text" bind:value={localLabel} placeholder="Enter image name..." />
								</label>
								{#if imageGenerateMode}
									<textarea class="textarea rounded-container" rows="6" bind:value={localImagePrompt} placeholder="Describe the image you want generated..."></textarea>
								{:else}
									<div class="space-y-4">
										<label class="label">
											<span class="label-text">Alt Text</span>
											<textarea class="textarea rounded-container" rows="2" bind:value={imageAltText} placeholder="Describe the image for accessibility..."></textarea>
										</label>
										<div class="space-y-3">
											<p class="text-sm font-medium">Image Source</p>
											<div class="space-y-4">
												<label class="label">
													<span class="label-text">Image URL</span>
													<input class="input" type="text" bind:value={imageUrlInput} placeholder="https://example.com/image.jpg" />
												</label>
												<div class="flex items-center gap-2 text-sm text-surface-500">
													<span>— or —</span>
												</div>
												<label class="label">
													<span class="label-text">Upload Image</span>
													<FileUpload>
														<FileUpload.Label>Select or drag an image file</FileUpload.Label>
														<FileUpload.Dropzone>
															<FileIcon class="size-10" />
															<span>Select image or drag here.</span>
															<FileUpload.Trigger>Browse Files</FileUpload.Trigger>
															<FileUpload.HiddenInput accept="image/*" />
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
													</FileUpload>
												</label>
												{#if uploadedImage}
													<div class="border border-surface-200 rounded-lg p-3 bg-surface-50">
														<p class="text-xs text-surface-500 mb-2">Uploaded: {uploadedImage.name}</p>
														<p class="text-xs text-surface-400">{uploadedImage.size} bytes</p>
													</div>
												{/if}
											</div>
										</div>
									</div>
								{/if}
							</div>

						{:else if localType === 'code'}
							<div class="space-y-4">
								<div class="flex items-center gap-3 p-3 border border-surface-200 rounded-lg bg-surface-50">
									<span class="flex-1 text-sm font-medium">Generate code</span>
									<label class="relative inline-flex items-center cursor-pointer">
										<input type="checkbox" class="toggle sr-only peer" bind:checked={codeGenerateMode} />
										<div class="w-11 h-6 bg-surface-300 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-surface-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500 peer-checked:peer-focus:ring-primary-500"></div>
									</label>
								</div>
								<label class="label">
									<span class="label-text">Code Name</span>
									<input class="input" type="text" bind:value={localLabel} placeholder="Enter code name..." />
								</label>
								{#if codeGenerateMode}
									<textarea class="textarea rounded-container" rows="6" bind:value={localCode} placeholder="Describe the code you're looking for..."></textarea>
								{:else}
									<textarea class="textarea font-mono text-sm bg-surface-100" rows="10" bind:value={localCode} placeholder="Enter code here..."></textarea>
								{/if}
							</div>

						{:else if localType === 'equation'}
							<div class="space-y-4">
								<div class="flex items-center gap-3 p-3 border border-surface-200 rounded-lg bg-surface-50">
									<span class="flex-1 text-sm font-medium">Generate equation</span>
									<label class="relative inline-flex items-center cursor-pointer">
										<input type="checkbox" class="toggle sr-only peer" bind:checked={equationGenerateMode} />
										<div class="w-11 h-6 bg-surface-300 peer-focus:ring-2 peer-focus:ring-primary-300 rounded-full peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-surface-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500 peer-checked:peer-focus:ring-primary-500"></div>
									</label>
								</div>
								<label class="label">
									<span class="label-text">Equation Name</span>
									<input class="input" type="text" bind:value={localLabel} placeholder="Enter equation name..." />
								</label>
								{#if equationGenerateMode}
									<textarea class="textarea rounded-container" rows="6" bind:value={localEquation} placeholder="Describe the equation you're looking for..."></textarea>
								{:else}
									<div class="space-y-3">
										<textarea class="textarea font-mono text-sm bg-surface-100" rows="4" bind:value={localEquation} placeholder="Enter LaTeX syntax (e.g., E = mc^2)..."></textarea>
										{#if localEquation}
											<div class="border border-surface-200 rounded-lg p-4 bg-surface-50">
												<p class="text-xs text-surface-500 mb-2">Preview:</p>
												<div class="katex-preview text-center">
													{@html renderToString(localEquation, { throwOnError: false, displayMode: true })}
												</div>
											</div>
										{/if}
									</div>
								{/if}
							</div>
						{/if}
					</Tabs.Content>

					<Tabs.Content value="output" class="pt-2">
						{#if currentGenerateMode}
							{#if content.generated_content}
								<div class="rounded-lg border border-surface-200 bg-surface-50 p-4">
									{#if localType === 'equation'}
										<div class="katex-preview text-center">
											{@html renderToString(content.generated_content, { throwOnError: false, displayMode: true })}
										</div>
									{:else if localType === 'code'}
										<pre class="overflow-auto text-sm font-mono"><code>{content.generated_content}</code></pre>
									{:else if localType === 'image'}
										{#if content.imageUrl}
											<img src={content.imageUrl} alt={content.altText || localLabel} class="max-w-full rounded-lg" />
											<p class="text-xs text-surface-400 mt-2 italic">{content.generated_content}</p>
										{:else}
											<p class="whitespace-pre-wrap text-sm">{content.generated_content}</p>
										{/if}
									{:else}
										<p class="whitespace-pre-wrap text-sm">{content.generated_content}</p>
									{/if}
								</div>
							{:else}
								<p class="text-sm text-surface-400 italic p-4">No generated output yet. Click "Generate Now" to generate.</p>
							{/if}
						{:else}
							{#if localType === 'image'}
								{#if imageUrlInput}
									<img src={imageUrlInput} alt={imageAltText} class="max-w-full rounded-lg" />
								{:else if uploadedImage}
									<div class="rounded-lg border border-surface-200 bg-surface-50 p-4">
										<p class="text-sm font-medium">{uploadedImage.name}</p>
										<p class="text-xs text-surface-400">{uploadedImage.size} bytes</p>
									</div>
								{:else}
									<p class="text-sm text-surface-400 italic p-4">(No image set)</p>
								{/if}
							{:else if localType === 'code'}
								{#if localCode}
									<pre class="rounded-lg bg-surface-100 p-4 text-sm font-mono overflow-auto"><code>{localCode}</code></pre>
								{:else}
									<p class="text-sm text-surface-400 italic p-4">(No code entered)</p>
								{/if}
							{:else if localType === 'equation'}
								{#if localEquation}
									<div class="rounded-lg border border-surface-200 bg-surface-50 p-4 text-center">
										{@html renderToString(localEquation, { throwOnError: false, displayMode: true })}
									</div>
								{:else}
									<p class="text-sm text-surface-400 italic p-4">(No equation entered)</p>
								{/if}
							{:else}
								{#if localText}
									<div class="rounded-lg border border-surface-200 bg-surface-50 p-4">
										<p class="whitespace-pre-wrap text-sm">{localText}</p>
									</div>
								{:else}
									<p class="text-sm text-surface-400 italic p-4">(No content entered)</p>
								{/if}
							{/if}
						{/if}
					</Tabs.Content>
				</Tabs>

				<div class="flex justify-end gap-2 pt-4 border-t border-surface-200">
					<button class="btn preset-outlined" onclick={handleCancel}>Cancel</button>
					{#if currentGenerateMode}
						<button class="btn preset-filled-secondary-500" onclick={generateNow} disabled={isGenerating}>
							{isGenerating ? 'Generating...' : 'Generate Now'}
						</button>
					{/if}
					<button class="btn preset-filled-primary-500" onclick={handleSave}>Save</button>
				</div>
			</div>
		</Dialog.Content>
	</Dialog.Positioner>
</Dialog>

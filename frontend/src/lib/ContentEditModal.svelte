<script lang="ts">
	import { untrack } from 'svelte';
	import { Dialog, Tabs, Input, Textarea, Select, Checkbox, FileDrop, Button } from '@cyberpunk-apps/neondeck';
	import { renderToString } from 'katex';
	import 'katex/dist/katex.min.css';
	import type { TreeNode, StoredAttachment } from '$lib/types';
	import { ACCEPTED_ATTACHMENT_TYPES, extractFileText } from '$lib/contextExtractor';
	import AttachmentList from '$lib/AttachmentList.svelte';
	import { generateItem } from '$lib/generation';
	import { getConfig } from '$lib/config';
	import { toaster } from '$lib/toaster';

	let { sectionId, content, onClose }: { sectionId: string; content: TreeNode; onClose: (data: Partial<TreeNode> | null) => void } = $props();

	let activeTab = $state('details');
	let open = $state(true);
	let isGenerating = $state(false);
	// The node being generated. Reactive, so the Output tab shows text as it streams in.
	let live = $state<TreeNode | null>(null);
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
	let uploadedName = $state('');

	// code
	let codeGenerateMode = $state(untrack(() => content.generate ?? false));
	let localCode = $state(untrack(() => content.content ?? ''));

	// equation
	let equationGenerateMode = $state(untrack(() => content.generate ?? false));
	let localEquation = $state(untrack(() => content.content ?? ''));

	// table
	let tableGenerateMode = $state(untrack(() => content.generate ?? false));
	let localTable = $state(untrack(() => content.content ?? ''));

	// attachments (text blocks): text is extracted on upload and kept with the node
	let attachments = $state<StoredAttachment[]>(untrack(() => [...(content.storedAttachments ?? [])]));
	let reading = $state(0);
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

	// An uploaded image becomes a data URL, which the library stores once in images/.
	function addImage(files: File[]) {
		const f = files[0];
		if (!f) return;
		const reader = new FileReader();
		reader.onload = () => {
			imageUrlInput = String(reader.result);
			uploadedName = f.name;
		};
		reader.readAsDataURL(f);
	}

	// Resync if content identity changes while open
	let currentGenerateMode = $derived(
		localType === 'text_block' ? textGenerateMode :
		localType === 'image' ? imageGenerateMode :
		localType === 'code' ? codeGenerateMode :
		localType === 'equation' ? equationGenerateMode :
		localType === 'table' ? tableGenerateMode : false
	);

	const CONTENT_TYPE_LABELS: Record<string, string> = {
		text_block: 'text block', image: 'image', code: 'code', equation: 'equation', table: 'table',
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
					localType === 'table' ? localTable :
					localText,
			};

			live = tempNode;
			activeTab = 'output';
			await generateItem(live, null, []);
			const done = live;

			// Copy generated fields back to the live content node for display
			content.generated_content = done.generated_content;
			if (done.imageUrl) {
				content.imageUrl = done.imageUrl;
				imageUrlInput = done.imageUrl; // sync so handleSave picks it up
			}
			if (done.altText) content.altText = done.altText;
		} catch (error) {
			console.error('Generation error:', error);
			toaster.create({ title: 'Generation failed', description: String(error), type: 'error' });
		}
		live = null;
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
				references: referencesText.split('\n').filter((r) => r.trim()),
				storedAttachments: attachments });
		} else if (localType === 'image') {
			onClose({ ...base, generate: imageGenerateMode, content: localImagePrompt,
				altText: imageAltText, imageUrl: imageUrlInput });
		} else if (localType === 'code') {
			onClose({ ...base, generate: codeGenerateMode, content: localCode });
		} else if (localType === 'equation') {
			onClose({ ...base, generate: equationGenerateMode, content: localEquation });
		} else if (localType === 'table') {
			onClose({ ...base, generate: tableGenerateMode, content: localTable,
				description: localDescription, key_points: localKeyPoints,
				conclusion: localConclusion, additional_details: localAdditionalDetails });
		} else {
			onClose(base);
		}
	}

	function handleCancel() {
		onClose(null);
	}
</script>

<Dialog bind:open title="Edit {CONTENT_TYPE_LABELS[localType] ?? localType}" index="03" meta={content.id} size="lg" onclose={() => onClose(null)}>
	<Tabs label="Content editor" items={[{ value: 'details', label: 'Details' }, { value: 'output', label: 'Output' }]} bind:value={activeTab}>
		{#snippet children(tab)}
			{#if tab === 'details'}
				<div class="form">
					<div class="two">
						<Select
							label="Type"
							bind:value={localType}
							options={[
								{ value: 'text_block', label: 'Text block' },
								{ value: 'image', label: 'Image' },
								{ value: 'code', label: 'Code' },
								{ value: 'equation', label: 'Equation' },
								{ value: 'table', label: 'Table' }
							]}
						/>
						<Input label="Name" bind:value={localLabel} />
					</div>

					{#if localType === 'text_block'}
						<Checkbox label="Generate with AI" hint="Off: the text below is used as written." bind:checked={textGenerateMode} />
						<Textarea
							label={textGenerateMode ? 'What to write' : 'Text'}
							rows={8}
							bind:value={localText}
							placeholder={textGenerateMode ? 'Describe the text you want.' : 'Write the text.'}
						/>
						{#if textGenerateMode}
							<Textarea label="Description" rows={3} bind:value={localDescription} placeholder="What this block is about" />
							<div class="two">
								<Textarea label="Purpose" rows={2} bind:value={localPurpose} placeholder="What this block is for" />
								<Textarea label="Key points" rows={2} bind:value={localKeyPoints} placeholder="The points it must cover" />
								<Textarea label="Conclusion" rows={2} bind:value={localConclusion} placeholder="The conclusion it should reach" />
								<Textarea label="Additional details" rows={2} bind:value={localAdditionalDetails} placeholder="Directions or data" />
							</div>
							<div class="range">
								<label class="nd-label" for="paragraphs-{content.id}">Length</label>
								<input id="paragraphs-{content.id}" type="range" min="1" max={maxParagraphs} step="1" bind:value={localParagraphs} />
								<span class="nd-mono">{localParagraphs} / {maxParagraphs} paragraph{localParagraphs === 1 ? '' : 's'}</span>
							</div>
							<Textarea label="References (one per line)" rows={3} mono bind:value={referencesText} placeholder="https://…" />
							<div>
								<FileDrop label="Attach files" hint="md · txt · docx · odt · pdf. Used as background." accept={ACCEPTED_ATTACHMENT_TYPES} multiple onfiles={addFiles} />
								<AttachmentList bind:attachments {reading} />
							</div>
						{/if}

					{:else if localType === 'image'}
						<Checkbox label="Generate with AI" hint="Off: use an image URL or upload a file." bind:checked={imageGenerateMode} />
						{#if imageGenerateMode}
							<Textarea label="Image prompt" rows={6} bind:value={localImagePrompt} placeholder="Describe the image you want." />
						{:else}
							<Textarea label="Alt text" rows={2} bind:value={imageAltText} placeholder="Describe the image for people who can't see it." />
							<Input label="Image URL" bind:value={imageUrlInput} placeholder="https://…" />
							<p class="nd-meta or">// or</p>
							<FileDrop label="Upload an image" hint={uploadedName ? `loaded: ${uploadedName}` : 'png · jpg · gif · webp · svg'} accept="image/*" onfiles={addImage} />
						{/if}

					{:else if localType === 'code'}
						<Checkbox label="Generate with AI" hint="Off: the code below is used as written." bind:checked={codeGenerateMode} />
						<Textarea
							label={codeGenerateMode ? 'What the code should do' : 'Code'}
							rows={codeGenerateMode ? 6 : 12}
							mono={!codeGenerateMode}
							bind:value={localCode}
							placeholder={codeGenerateMode ? 'Describe the code you want.' : '// code'}
						/>

					{:else if localType === 'equation'}
						<Checkbox label="Generate with AI" hint="Off: write LaTeX below." bind:checked={equationGenerateMode} />
						{#if equationGenerateMode}
							<Textarea label="What the equation should show" rows={6} bind:value={localEquation} placeholder="Describe the equation you want." />
						{:else}
							<Textarea label="LaTeX" rows={4} mono bind:value={localEquation} placeholder="E = mc^2" />
							{#if localEquation}
								<div class="eq paper nd-paper">
									{@html renderToString(localEquation, { throwOnError: false, displayMode: true })}
								</div>
							{/if}
						{/if}

					{:else if localType === 'table'}
						<Checkbox label="Generate with AI" hint="Off: write a Markdown table below." bind:checked={tableGenerateMode} />
						{#if tableGenerateMode}
							<Textarea label="Description" rows={3} bind:value={localDescription} placeholder="What the table shows" />
							<Textarea label="Columns or data" rows={2} bind:value={localKeyPoints} placeholder="Which columns and rows to include" />
							<div class="two">
								<Textarea label="Notes" rows={2} bind:value={localConclusion} placeholder="Anything to note" />
								<Textarea label="Additional details" rows={2} bind:value={localAdditionalDetails} placeholder="Directions or data" />
							</div>
						{:else}
							<Textarea label="Markdown table" rows={8} mono bind:value={localTable} placeholder={'| col | col |\n| --- | --- |\n| val | val |'} />
						{/if}
					{/if}
				</div>

			{:else}
				{@const out = currentGenerateMode ? (live ?? content).generated_content : null}
				{#if isGenerating && !out}
					<p class="nd-meta">&gt; generating…</p>
				{:else if currentGenerateMode && !out}
					<p class="nd-meta">&gt; no output yet. Press Generate now.</p>
				{:else if localType === 'equation' && (out || localEquation)}
					<div class="eq paper nd-paper">{@html renderToString(out || localEquation, { throwOnError: false, displayMode: true })}</div>
				{:else if localType === 'code' && (out || localCode)}
					<pre><code>{out || localCode}</code></pre>
				{:else if localType === 'image' && (currentGenerateMode ? content.imageUrl : imageUrlInput)}
					<img class="img" src={currentGenerateMode ? content.imageUrl : imageUrlInput} alt={(currentGenerateMode ? content.altText : imageAltText) || localLabel} />
					{#if out}<p class="nd-meta">{out}</p>{/if}
				{:else if localType === 'table' && (out || localTable)}
					<pre><code>{out || localTable}</code></pre>
				{:else if out || localText}
					<p class="prose">{out || localText}</p>
				{:else}
					<p class="nd-meta">&gt; nothing here yet</p>
				{/if}
			{/if}
		{/snippet}
	</Tabs>
	{#snippet footer()}
		<Button variant="ghost" onclick={handleCancel}>Cancel</Button>
		{#if currentGenerateMode}
			<Button variant="outline" onclick={generateNow} disabled={isGenerating}>{isGenerating ? 'Generating…' : 'Generate now'}</Button>
		{/if}
		<Button onclick={handleSave}>Save</Button>
	{/snippet}
</Dialog>

<style>
	.form { display: flex; flex-direction: column; gap: var(--nd-space-4); }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: var(--nd-space-4); }
	.range { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: var(--nd-space-3); }
	.range input { accent-color: var(--nd-accent); }
	.or { margin: 0; }
	.paper { padding: var(--nd-space-4); }
	.eq { overflow-x: auto; text-align: center; }
	.img { max-width: 100%; border: 1px solid var(--nd-line); }
	.prose { white-space: pre-wrap; max-width: none; }
	@media (max-width: 720px) { .two { grid-template-columns: 1fr; } }
</style>

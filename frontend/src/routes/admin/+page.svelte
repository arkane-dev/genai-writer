<script lang="ts">
	import { getConfig, saveConfig, type ApiConfig } from '$lib/config';
	import { onMount } from 'svelte';
	import { Panel, Input, Button, Readout, SectionHeader } from '@cyberpunk-apps/neondeck';
	import { inWails } from '$lib/platform/env';
	import * as GoStore from '$lib/wailsjs/go/main/Store';
	import * as GoKV from '$lib/wailsjs/go/main/KV';
	import { store } from '$lib/platform/store.svelte';
	import { netFetch } from '$lib/platform/net';
	import { currentDoc } from '$lib/currentDoc.svelte';
	import { swarmUITestConnection } from '$lib/swarmui';

	let config = $state<ApiConfig>(getConfig());

	// Desktop only: where the library and the prefs file live.
	let libraryPath = $state('');
	let prefsPath = $state('');
	onMount(async () => {
		if (!inWails) return;
		[libraryPath, prefsPath] = await Promise.all([GoStore.Root(), GoKV.Path()]);
	});
	let saveMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	// ── Text API test + model discovery ───────────────────────────────────
	let testing = $state(false);
	let testResult = $state<{ success: boolean; message: string } | null>(null);
	let availableModels = $state<string[]>([]);
	let showModelPicker = $state(false);

	async function fetchModels(): Promise<string[]> {
		const response = await netFetch(`${config.baseURL}/models`, {
			method: 'GET',
			headers: { 'Authorization': `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
		});
		if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
		const data = await response.json();
		return (data.data as { id: string }[] ?? []).map((m) => m.id).filter(Boolean).sort();
	}

	async function handleTest() {
		testing = true;
		testResult = null;
		try {
			const models = await fetchModels();
			availableModels = models;
			const modelExists = models.some((id) => id === config.model || id.includes(config.model));
			testResult = {
				success: true,
				message: modelExists
					? `Connected! Model "${config.model}" found. ${models.length} model(s) available.`
					: `Connected! Model "${config.model}" not in list but API is accessible. ${models.length} model(s) available.`,
			};
		} catch (e) {
			testResult = { success: false, message: `Connection failed: ${e instanceof Error ? e.message : 'Unknown error'}` };
		} finally {
			testing = false;
		}
	}

	async function handleFetchModels() {
		testing = true;
		testResult = null;
		try {
			availableModels = await fetchModels();
			showModelPicker = true;
		} catch (e) {
			testResult = { success: false, message: `Failed to fetch models: ${e instanceof Error ? e.message : 'Unknown error'}` };
		} finally {
			testing = false;
		}
	}

	function selectModel(id: string) {
		config.model = id;
		showModelPicker = false;
	}

	// ── SwarmUI test ───────────────────────────────────────────────────────
	let testingImage = $state(false);
	let imageTestResult = $state<{ success: boolean; message: string } | null>(null);

	async function handleTestImage() {
		if (!config.imageBaseURL.trim()) {
			imageTestResult = { success: false, message: 'Enter a SwarmUI Base URL first (e.g. /swarm or http://localhost:7801).' };
			return;
		}
		testingImage = true;
		imageTestResult = null;
		try {
			const sessionId = await swarmUITestConnection(config.imageBaseURL, config.imageSwarmToken || undefined);
			imageTestResult = { success: true, message: `Connected! Session: ${sessionId.slice(0, 12)}…` };
		} catch (e) {
			imageTestResult = { success: false, message: `Connection failed: ${e instanceof Error ? e.message : 'Unknown error'}` };
		} finally {
			testingImage = false;
		}
	}

	// ── Save / reset ───────────────────────────────────────────────────────
	function handleSave() {
		try {
			saveConfig(config);
			saveMessage = { type: 'success', text: 'Configuration saved successfully!' };
			setTimeout(() => (saveMessage = null), 3000);
		} catch {
			saveMessage = { type: 'error', text: 'Failed to save configuration.' };
			setTimeout(() => (saveMessage = null), 3000);
		}
	}

	function resetToDefaults() {
		config = {
			baseURL: 'http://localhost:11434/v1',
			apiKey: 'ollama',
			model: 'gemma3:27b-it-q4_K_M',
			maxOutputParagraphs: 10,
			imageModel: '',
			imageApiBaseURL: '',
			imageApiKey: '',
			imageWidth: 1024,
			imageHeight: 1024,
			imageBaseURL: '',
			imageSwarmToken: '',
			imageEndpoint: '/API/GenerateText2Image',
			imageSteps: 20,
			imageCfgScale: 7,
		};
		saveMessage = { type: 'success', text: 'Reset to defaults (not saved yet).' };
		setTimeout(() => (saveMessage = null), 3000);
	}

	// ── Clear document data ────────────────────────────────────────────────
	let clearConfirm = $state(false);
	let clearMessage = $state<{ type: 'success' | 'error'; text: string } | null>(null);

	async function handleClearDocument() {
		if (!clearConfirm) {
			clearConfirm = true;
			setTimeout(() => (clearConfirm = false), 4000);
			return;
		}
		try {
			await store.clearSnapshots(currentDoc.id ?? null);
			clearMessage = { type: 'success', text: 'Document history cleared. Reload the editor to start fresh.' };
			clearConfirm = false;
		} catch {
			clearMessage = { type: 'error', text: 'Failed to clear document data.' };
			clearConfirm = false;
		}
		setTimeout(() => (clearMessage = null), 5000);
	}
</script>

<svelte:head>
	<title>Settings · GenAI Writer</title>
</svelte:head>

<SectionHeader index="01" zh="设置" title="Settings" meta="models · images · library" />

<div class="grid">
	<Panel title="Text model" index="01" meta="openai-compatible" class="span-2">
		<div class="form">
			<Input label="API URL" type="url" placeholder="https://api.openai.com/v1" bind:value={config.baseURL} hint="Any OpenAI-compatible endpoint: OpenAI, OpenRouter, Ollama, vLLM." />
			<Input label="API key" type="password" placeholder="sk-…" bind:value={config.apiKey} hint={inWails ? `Saved in ${prefsPath || 'your config folder'}, readable only by you.` : 'Saved in this browser.'} />
			<div class="model">
				<div class="grow"><Input label="Model" placeholder="gpt-4o, gemma3:27b, …" bind:value={config.model} /></div>
				<div class="menu-anchor">
					<Button variant="outline" onclick={handleFetchModels} disabled={testing} aria-expanded={showModelPicker} title="List the models this API offers">
						{testing ? 'Fetching…' : 'Browse ▾'}
					</Button>
					{#if showModelPicker && availableModels.length > 0}
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="scrim" onclick={() => { showModelPicker = false; }}></div>
						<div class="menu">
							<p class="nd-label menu-head">{availableModels.length} models</p>
							{#each availableModels as id (id)}
								<button class="item" class:on={config.model === id} onclick={() => selectModel(id)}>{id}</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>
			<div class="range">
				<label class="nd-label" for="max-paragraphs">Max length</label>
				<input id="max-paragraphs" type="range" min="1" max="20" step="1" bind:value={config.maxOutputParagraphs} />
				<span class="nd-mono">{config.maxOutputParagraphs} paragraph{config.maxOutputParagraphs === 1 ? '' : 's'}</span>
			</div>
			<p class="nd-meta">The most paragraphs a text block can ask for.</p>
			<div class="row">
				<Button variant="outline" onclick={handleTest} disabled={testing}>{testing ? 'Testing…' : 'Test connection'}</Button>
				{#if testResult}<p class="result" class:bad={!testResult.success} role="status">&gt; {testResult.message}</p>{/if}
			</div>
		</div>
	</Panel>

	<Panel title="Library" index="02" meta={inWails ? 'on disk' : 'in browser'}>
		{#if inWails}
			<div class="paths">
				<Readout size="sm" label="Documents" value={libraryPath || '…'} />
				<Readout size="sm" label="Settings" value={prefsPath || '…'} />
			</div>
		{:else}
			<p class="nd-meta">&gt; browser build: documents live in IndexedDB</p>
		{/if}
		<div class="danger">
			<p class="nd-label">Clear history</p>
			<p class="small">
				{#if currentDoc.id}
					Deletes every snapshot of “{currentDoc.title || 'this document'}”. It reopens with an empty tree.
				{:else}
					Open a document first.
				{/if}
			</p>
			<Button variant={clearConfirm ? 'danger' : 'outline'} accent="red" onclick={handleClearDocument} disabled={!currentDoc.id}>
				{clearConfirm ? 'Click again to confirm' : 'Clear history'}
			</Button>
			{#if clearMessage}<p class="result" class:bad={clearMessage.type === 'error'} role="status">&gt; {clearMessage.text}</p>{/if}
		</div>
	</Panel>

	<Panel title="Images" index="03" meta="openai images api" class="span-2">
		<p class="small">Used when an image model is set. SwarmUI takes priority if its URL is set.</p>
		<div class="form">
			<Input label="Image model" placeholder="dall-e-3, flux, …" bind:value={config.imageModel} />
			<div class="two">
				<Input label="Image API URL (optional)" type="url" placeholder="Same as text API" bind:value={config.imageApiBaseURL} />
				<Input label="Image API key (optional)" type="password" placeholder="Same as text API" bind:value={config.imageApiKey} />
				<Input label="Width (px)" type="number" min="64" max="4096" step="64" bind:value={config.imageWidth} />
				<Input label="Height (px)" type="number" min="64" max="4096" step="64" bind:value={config.imageHeight} />
			</div>
		</div>
	</Panel>

	<Panel title="SwarmUI" index="04" meta="local image server">
		<p class="small">Connects to a <a href="https://github.com/mcmonkeyprojects/SwarmUI" target="_blank" rel="noopener">SwarmUI</a> server. It gets a session before each image.</p>
		<div class="form">
			<Input
				label="Base URL"
				placeholder="Blank turns SwarmUI off"
				bind:value={config.imageBaseURL}
				hint={inWails ? 'Use the real address, e.g. http://localhost:7801.' : 'Browser dev: /swarm goes through the Vite proxy.'}
			/>
			<Input label="Token (optional)" type="password" placeholder="Only if SwarmUI uses accounts" bind:value={config.imageSwarmToken} />
			<Input label="Endpoint" placeholder="/API/GenerateText2Image" bind:value={config.imageEndpoint} />
			<div class="two">
				<Input label="Steps" type="number" min="1" max="150" bind:value={config.imageSteps} />
				<Input label="CFG scale" type="number" min="1" max="30" step="0.5" bind:value={config.imageCfgScale} />
			</div>
			<div class="row">
				<Button variant="outline" onclick={handleTestImage} disabled={testingImage}>{testingImage ? 'Testing…' : 'Test SwarmUI'}</Button>
			</div>
			{#if imageTestResult}<p class="result" class:bad={!imageTestResult.success} role="status">&gt; {imageTestResult.message}</p>{/if}
		</div>
	</Panel>
</div>

<div class="save">
	{#if saveMessage}<p class="result" class:bad={saveMessage.type === 'error'} role="status">&gt; {saveMessage.text}</p>{/if}
	<Button variant="ghost" onclick={resetToDefaults}>Reset to defaults</Button>
	<Button size="lg" onclick={handleSave}>Save settings</Button>
</div>

<style>
	.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--nd-space-5); }
	.grid :global(.span-2) { grid-column: span 2; }
	.form { display: flex; flex-direction: column; gap: var(--nd-space-4); }
	.two { display: grid; grid-template-columns: 1fr 1fr; gap: var(--nd-space-4); }
	.model { display: flex; align-items: flex-end; gap: var(--nd-space-2); }
	.grow { flex: 1; min-width: 0; }
	.range { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: var(--nd-space-3); }
	.range input { accent-color: var(--nd-accent); }
	.row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--nd-space-3); }
	.small { color: var(--nd-text-dim); font-size: var(--nd-text-sm); }
	.result { margin: 0; font-family: var(--nd-font-mono); font-size: var(--nd-text-xs); color: var(--nd-success); }
	.result.bad { color: var(--nd-danger); }
	.paths { display: flex; flex-direction: column; gap: var(--nd-space-3); overflow-wrap: anywhere; }
	.danger { display: flex; flex-direction: column; align-items: flex-start; gap: var(--nd-space-2); margin-top: var(--nd-space-5); padding-top: var(--nd-space-4); border-top: 1px solid var(--nd-line); }
	.danger .small, .danger .nd-label { margin: 0; }
	.save { position: sticky; bottom: var(--nd-statusbar-h); display: flex; justify-content: flex-end; align-items: center; gap: var(--nd-space-3); margin-top: var(--nd-space-6); padding: var(--nd-space-3) 0; border-top: 1px solid var(--nd-line); background: var(--nd-bg); }

	.menu-anchor { position: relative; }
	.scrim { position: fixed; inset: 0; z-index: 10; }
	.menu { position: absolute; top: calc(100% + 4px); right: 0; z-index: 20; width: 18rem; max-height: 16rem; overflow-y: auto; border: 1px solid var(--nd-line-strong); background: var(--nd-surface-3); }
	.menu-head { margin: 0; padding: var(--nd-space-2) var(--nd-space-3) var(--nd-space-1); font-size: var(--nd-text-2xs); }
	.item { display: block; width: 100%; padding: var(--nd-space-2) var(--nd-space-3); overflow: hidden; border: 0; background: transparent; font-family: var(--nd-font-mono); font-size: var(--nd-text-sm); text-align: left; text-overflow: ellipsis; white-space: nowrap; cursor: pointer; }
	.item:hover, .item:focus-visible { background: var(--nd-accent-tint); }
	.item.on { color: var(--nd-accent); }

	@media (max-width: 1100px) {
		.grid { grid-template-columns: 1fr; }
		.grid :global(.span-2) { grid-column: auto; }
	}
</style>

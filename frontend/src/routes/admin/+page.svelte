<script lang="ts">
	import { getConfig, saveConfig, type ApiConfig } from '$lib/config';
	import { CheckIcon, XIcon, Trash2Icon, ImageIcon, ChevronDownIcon } from '@lucide/svelte';
	import { store } from '$lib/platform/store.svelte';
	import { netFetch } from '$lib/platform/net';
	import { currentDoc } from '$lib/currentDoc.svelte';
	import { swarmUITestConnection } from '$lib/swarmui';

	let config = $state<ApiConfig>(getConfig());
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

<div class="min-h-screen p-8">
	<div class="mb-8 flex flex-col gap-2">
		<h1 class="h1">Settings</h1>
		<p class="text-primary-600">Configure AI endpoints and generation options</p>
	</div>

	<div class="max-w-2xl space-y-8">

		<!-- ── Text generation ──────────────────────────────────────────────── -->
		<section class="space-y-4">
			<h2 class="text-base font-semibold border-b border-surface-200 pb-2">Text Generation (OpenAI-compatible)</h2>

			<label class="label">
				<span class="label-text">API URL</span>
				<input class="input" type="url" placeholder="https://api.openai.com/v1" bind:value={config.baseURL} />
				<span class="label-text-alt">Base URL for your OpenAI-compatible API</span>
			</label>

			<label class="label">
				<span class="label-text">API Key</span>
				<input class="input" type="password" placeholder="sk-..." bind:value={config.apiKey} />
				<span class="label-text-alt">Stored locally in your browser</span>
			</label>

			<label class="label">
				<span class="label-text">Model Name</span>
				<div class="flex gap-2">
					<input class="input flex-1" type="text" placeholder="gpt-4o, gemma3:27b, etc." bind:value={config.model} />
					<div class="relative">
						<button
							class="btn preset-outlined flex items-center gap-1 whitespace-nowrap"
							onclick={handleFetchModels}
							disabled={testing}
							title="Fetch available models from the API"
						>
							<ChevronDownIcon class="w-4 h-4" />
							{testing ? 'Fetching…' : 'Browse'}
						</button>
						{#if showModelPicker && availableModels.length > 0}
							<!-- svelte-ignore a11y_interactive_supports_focus -->
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div class="fixed inset-0 z-10" role="button" onclick={() => { showModelPicker = false; }}></div>
							<div class="absolute right-0 top-full mt-1 z-20 bg-white border border-surface-200 rounded-lg shadow-lg w-72 max-h-64 overflow-y-auto">
								<p class="text-[10px] font-semibold text-surface-400 uppercase tracking-wide px-3 pt-2 pb-1">{availableModels.length} models available</p>
								{#each availableModels as id}
									<button
										class="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 font-mono truncate {config.model === id ? 'text-primary-600 font-semibold bg-primary-50' : ''}"
										onclick={() => selectModel(id)}
									>{id}</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
				<span class="label-text-alt">Model identifier for text generation — use Browse to pick from available models</span>
			</label>

			<div class="space-y-2">
				<div class="flex items-center justify-between">
					<span class="label-text">Maximum Output Length</span>
					<span class="text-sm font-medium text-primary-600">{config.maxOutputParagraphs} {config.maxOutputParagraphs === 1 ? 'paragraph' : 'paragraphs'}</span>
				</div>
				<input
					type="range"
					class="w-full accent-primary-500"
					min="1"
					max="20"
					step="1"
					bind:value={config.maxOutputParagraphs}
				/>
				<div class="flex justify-between text-xs text-surface-400">
					<span>1</span>
					<span>20</span>
				</div>
				<p class="label-text-alt">Sets the maximum number of paragraphs selectable per text block</p>
			</div>

			{#if testResult}
				<div class="rounded-md p-3 {testResult.success ? 'bg-success-50 text-success-700' : 'bg-error-50 text-error-700'}">
					<span class="text-sm">{testResult.message}</span>
				</div>
			{/if}

			<div class="flex flex-wrap gap-2">
				<button class="btn preset-outlined" onclick={handleTest} disabled={testing}>
					{testing ? 'Testing…' : 'Test Connection'}
				</button>
			</div>
			<p class="text-xs text-surface-400">Tip: use the <strong>Browse</strong> button next to Model Name to fetch available models directly from the API.</p>
		</section>

		<!-- ── Image generation ─────────────────────────────────────────────── -->
		<section class="space-y-4">
			<div class="flex items-center gap-2 border-b border-surface-200 pb-2">
				<ImageIcon class="size-4 text-surface-500" />
				<h2 class="text-base font-semibold">Image Generation</h2>
			</div>
			<p class="text-sm text-surface-500">
				Configure an image generation model. If <strong>SwarmUI Base URL</strong> is set it takes priority; otherwise the <strong>OpenAI-compatible images API</strong> is used when a model is configured.
			</p>

			<!-- OpenAI-compatible images API -->
			<h3 class="text-sm font-medium text-surface-600">OpenAI-compatible Images API</h3>

			<label class="label">
				<span class="label-text">Image Model</span>
				<input class="input" type="text" placeholder="dall-e-3, flux, etc." bind:value={config.imageModel} />
				<span class="label-text-alt">Model for image generation. Required to use the OpenAI images API path.</span>
			</label>

			<label class="label">
				<span class="label-text">Image API URL <span class="text-surface-400">(optional)</span></span>
				<input class="input" type="url" placeholder="Leave blank to reuse the text API URL" bind:value={config.imageApiBaseURL} />
				<span class="label-text-alt">Override base URL for the image API. Defaults to the text API URL above.</span>
			</label>

			<label class="label">
				<span class="label-text">Image API Key <span class="text-surface-400">(optional)</span></span>
				<input class="input" type="password" placeholder="Leave blank to reuse the text API key" bind:value={config.imageApiKey} />
				<span class="label-text-alt">Override API key for the image API. Defaults to the text API key above.</span>
			</label>

			<div class="grid grid-cols-2 gap-4">
				<label class="label">
					<span class="label-text">Width (px)</span>
					<input class="input" type="number" min="64" max="4096" step="64" bind:value={config.imageWidth} />
				</label>
				<label class="label">
					<span class="label-text">Height (px)</span>
					<input class="input" type="number" min="64" max="4096" step="64" bind:value={config.imageHeight} />
				</label>
			</div>

			<!-- SwarmUI -->
			<h3 class="text-sm font-medium text-surface-600 pt-2">SwarmUI <span class="text-surface-400 font-normal">(optional — overrides images API when set)</span></h3>
			<p class="text-sm text-surface-500">
				Connects to a local <a href="https://github.com/mcmonkeyprojects/SwarmUI" class="underline hover:text-primary-600" target="_blank" rel="noopener">SwarmUI</a> instance.
				A session is obtained automatically before each generation.
			</p>

			<label class="label">
				<span class="label-text">SwarmUI Base URL</span>
				<input class="input" type="text" placeholder="Leave blank to disable SwarmUI" bind:value={config.imageBaseURL} />
				<span class="label-text-alt">Use <code class="text-xs bg-surface-100 px-1 rounded">/swarm</code> (proxied via Vite dev server) to avoid CORS. Use <code class="text-xs bg-surface-100 px-1 rounded">http://localhost:7801</code> only if SwarmUI has CORS headers enabled.</span>
			</label>

			<label class="label">
				<span class="label-text">Swarm Token <span class="text-surface-400">(optional)</span></span>
				<input class="input" type="password" placeholder="Leave blank for unauthenticated local instances" bind:value={config.imageSwarmToken} />
				<span class="label-text-alt">Required only if SwarmUI is configured with account authentication.</span>
			</label>

			<label class="label">
				<span class="label-text">Generation Endpoint</span>
				<input class="input" type="text" placeholder="/API/GenerateText2Image" bind:value={config.imageEndpoint} />
				<span class="label-text-alt">SwarmUI generation route (rarely needs changing)</span>
			</label>

			<div class="grid grid-cols-2 gap-4">
				<label class="label">
					<span class="label-text">Steps</span>
					<input class="input" type="number" min="1" max="150" bind:value={config.imageSteps} />
				</label>
				<label class="label">
					<span class="label-text">CFG Scale</span>
					<input class="input" type="number" min="1" max="30" step="0.5" bind:value={config.imageCfgScale} />
				</label>
			</div>

			{#if imageTestResult}
				<div class="rounded-md p-3 {imageTestResult.success ? 'bg-success-50 text-success-700' : 'bg-error-50 text-error-700'}">
					<span class="text-sm">{imageTestResult.message}</span>
				</div>
			{/if}

			<div class="flex flex-wrap gap-2">
				<button class="btn preset-outlined" onclick={handleTestImage} disabled={testingImage}>
					{testingImage ? 'Testing…' : 'Test SwarmUI Connection'}
				</button>
			</div>
		</section>

		<!-- ── Save / status ────────────────────────────────────────────────── -->
		{#if saveMessage}
			<div class="rounded-md p-3 flex items-center gap-2 {saveMessage.type === 'success' ? 'bg-success-50 text-success-700' : 'bg-error-50 text-error-700'}">
				{#if saveMessage.type === 'success'}<CheckIcon class="size-5" />{:else}<XIcon class="size-5" />{/if}
				<span>{saveMessage.text}</span>
			</div>
		{/if}

		<div class="flex flex-wrap gap-2">
			<button class="btn preset-filled-primary-500" onclick={handleSave}>Save Configuration</button>
			<button class="btn preset-outlined-warning-500" onclick={resetToDefaults}>Reset to Defaults</button>
		</div>

		<!-- ── Document data ─────────────────────────────────────────────────── -->
		<div class="pt-6 border-t border-surface-200 space-y-4">
			<div>
				<h2 class="text-base font-semibold mb-1">Document History</h2>
				<p class="text-sm text-surface-500 mb-3">
					{#if currentDoc.id}
						Delete all snapshots and undo history for <strong>"{currentDoc.title || 'current document'}"</strong>. The document will start with a blank tree on next open.
					{:else}
						No document is currently open. Open a document in the editor first to clear its history.
					{/if}
				</p>

				{#if clearMessage}
					<div class="rounded-md p-3 flex items-center gap-2 mb-3 {clearMessage.type === 'success' ? 'bg-success-50 text-success-700' : 'bg-error-50 text-error-700'}">
						{#if clearMessage.type === 'success'}<CheckIcon class="size-4 shrink-0" />{:else}<XIcon class="size-4 shrink-0" />{/if}
						<span class="text-sm">{clearMessage.text}</span>
					</div>
				{/if}

				<button
					class="btn {clearConfirm ? 'preset-filled-error-500' : 'preset-outlined-error-500'} flex items-center gap-2"
					onclick={handleClearDocument}
				>
					<Trash2Icon class="size-4" />
					{clearConfirm ? 'Click again to confirm' : 'Clear document data'}
				</button>
			</div>

			<a href="#/" class="btn preset-outlined-primary-500">← Back to Editor</a>
		</div>
	</div>
</div>

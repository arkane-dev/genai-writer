export interface ApiConfig {
	// ── Text generation (OpenAI-compatible) ───────────────────────────────
	baseURL: string;
	apiKey: string;
	model: string;
	maxOutputParagraphs: number;

	// ── Image generation (OpenAI-compatible images API) ───────────────────
	imageModel: string;          // model name, e.g. dall-e-3, flux, etc.
	imageApiBaseURL: string;     // leave blank to reuse text baseURL
	imageApiKey: string;         // leave blank to reuse text apiKey
	imageWidth: number;
	imageHeight: number;

	// ── Image generation (SwarmUI) ────────────────────────────────────────
	imageBaseURL: string;        // SwarmUI server — takes priority over OpenAI images API
	imageSwarmToken: string;     // auth token (optional for local instances)
	imageEndpoint: string;       // generation endpoint
	imageSteps: number;
	imageCfgScale: number;
}

const DEFAULT_CONFIG: ApiConfig = {
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

import { kvGet, kvSet } from '$lib/platform/kv';

const CONFIG_KEY = 'ai_writer_config';

export function getConfig(): ApiConfig {
	if (typeof window === 'undefined') return DEFAULT_CONFIG;

	const stored = kvGet(CONFIG_KEY);
	if (stored) {
		try {
			const parsed = JSON.parse(stored);
			return { ...DEFAULT_CONFIG, ...parsed };
		} catch (e) {
			console.error('Failed to parse config:', e);
			return DEFAULT_CONFIG;
		}
	}
	return DEFAULT_CONFIG;
}

export function saveConfig(config: ApiConfig): void {
	if (typeof window === 'undefined') return;
	kvSet(CONFIG_KEY, JSON.stringify(config));
}

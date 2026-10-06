import { loadKV } from '$lib/platform/kv';
import { currentDoc } from '$lib/currentDoc.svelte';

// Load persisted state (API config, open document) before any page renders,
// so the rest of the app can read it synchronously.
export async function load() {
	await loadKV();
	currentDoc.restore();
	return {};
}

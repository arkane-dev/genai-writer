import { browser } from '$app/environment';
import { kvGet, kvSet } from '$lib/platform/kv';
import { store } from '$lib/platform/store.svelte';

const LS_KEY = 'ai_writer_current_doc';

function readPersistedId(): number | null {
	if (!browser) return null;
	const raw = kvGet(LS_KEY);
	const n = raw ? parseInt(raw, 10) : NaN;
	return isNaN(n) ? null : n;
}

// Starts empty. restore() runs at startup, once the persisted state has loaded (see +layout.ts).
let _currentDocId = $state<number | null>(null);
let _currentDocTitle = $state<string>('');

export const currentDoc = {
	/** Reopen the last document after a restart. Clears it if it was deleted meanwhile. */
	async restore() {
		const id = readPersistedId();
		if (id === null) return;
		const doc = await store.getDocument(id);
		if (!doc) {
			kvSet(LS_KEY, null);
			return;
		}
		_currentDocId = id;
		_currentDocTitle = doc.title;
	},

	get id() { return _currentDocId; },
	get title() { return _currentDocTitle; },

	open(id: number, title: string) {
		_currentDocId = id;
		_currentDocTitle = title;
		if (browser) kvSet(LS_KEY, String(id));
	},

	setTitle(title: string) {
		_currentDocTitle = title;
	},

	close() {
		_currentDocId = null;
		_currentDocTitle = '';
		if (browser) kvSet(LS_KEY, null);
	},
};

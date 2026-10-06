import { browser } from '$app/environment';
import { kvGet, kvSet } from '$lib/platform/kv';

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
	restore() {
		_currentDocId = readPersistedId();
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

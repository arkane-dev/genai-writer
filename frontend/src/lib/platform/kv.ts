// Small persistent key-value state (API config, the open document).
// Desktop: a prefs file in the OS config dir, through Go. Browser: localStorage.
// Call loadKV() once at startup. After that, kvGet is synchronous.
import * as KV from '$lib/wailsjs/go/main/KV';
import { inWails } from './env';

const cache = new Map<string, string>();

export async function loadKV(): Promise<void> {
	if (!inWails) return;
	const all = await KV.All();
	cache.clear();
	for (const [k, v] of Object.entries(all ?? {})) cache.set(k, v);
}

export function kvGet(key: string): string | null {
	if (!inWails) return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
	return cache.get(key) ?? null;
}

/** Store a value. null removes the key. */
export function kvSet(key: string, value: string | null): void {
	if (!inWails) {
		if (value === null) localStorage.removeItem(key);
		else localStorage.setItem(key, value);
		return;
	}
	if (value === null) cache.delete(key);
	else cache.set(key, value);
	KV.Set(key, value ?? '').catch((err) => console.error(`Saving "${key}" failed:`, err));
}

import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		// Wails serves build/ from the binary. The hash router (#/documents) means every
		// route lives in one index.html, so deep links need no server.
		adapter: adapter({ fallback: 'index.html' }),
		router: { type: 'hash' }
	}
};

export default config;

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		proxy: {
			// Browser dev only: forward /swarm/* to SwarmUI to dodge CORS.
			// The desktop app doesn't need this. Its requests go through Go (src/lib/platform/net.ts).
			'/swarm': {
				target: 'http://localhost:7801',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/swarm/, '')
			}
		}
	}
});

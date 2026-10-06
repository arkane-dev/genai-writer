import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		proxy: {
			// Forward /swarm/* to SwarmUI, stripping the /swarm prefix.
			// This avoids the browser's CORS restriction since the request
			// becomes a server-to-server call from the Vite dev server.
			'/swarm': {
				target: 'http://localhost:7801',
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/swarm/, ''),
			},
		},
	},
});

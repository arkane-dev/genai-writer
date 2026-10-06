// Project identity. new-project.sh rewrites the `name` and `brand` lines.
export const app = {
	name: 'genai-writer', // must match appName in main.go
	brand: 'GENAI_WRITER_', // top-bar brand block; NEONDECK brands end in "_"
	nav: [
		{ label: 'Dashboard', zh: '控制台', href: '#/' },
		{ label: 'Settings', zh: '设置', href: '#/settings' }
	]
};

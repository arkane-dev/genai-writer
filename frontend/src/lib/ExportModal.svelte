<script lang="ts">
	import { Dialog, Button, toast } from '@cyberpunk-apps/neondeck';
	import type { TreeNode } from '$lib/types';

	let { tree, documentTitle, onClose }: { tree: TreeNode[]; documentTitle: string; onClose: () => void } = $props();

	let exporting = $state<string | null>(null);
	let open = $state(true);

	// Export modules are lazy-imported inside run() so docx/jszip/etc. are never
	// evaluated during SSR — they use debug's browser.js which accesses localStorage
	// on module load, triggering a Node 26 warning.
	// fn resolves to the saved path, null if the user cancelled, or nothing (PDF opens a print dialog).
	async function run(format: string, fn: () => Promise<string | null | void> | void) {
		exporting = format;
		try {
			const where = await fn();
			if (typeof where === 'string') toast.create({ title: 'Exported', description: where, type: 'success' });
		} catch (err) {
			toast.create({ title: 'Export failed', description: String(err), type: 'error' });
		} finally {
			exporting = null;
		}
	}

	const formats = [
		{
			id: 'markdown',
			label: 'Markdown ZIP',
			description: 'document.md plus an images folder',
			action: async () => {
				const { downloadMarkdownZip } = await import('$lib/export/markdown');
				return downloadMarkdownZip(tree, documentTitle);
			},
		},
		{
			id: 'docx',
			label: 'Word',
			description: '.docx with headings, images and code',
			action: async () => {
				const { downloadDocx } = await import('$lib/export/docxExport');
				return downloadDocx(tree, documentTitle);
			},
		},
		{
			id: 'pdf',
			label: 'PDF',
			description: 'print-ready page, then save as PDF',
			action: async () => {
				const { printAsPdf } = await import('$lib/export/printPdf');
				return printAsPdf(tree, documentTitle);
			},
		},
		{
			id: 'odt',
			label: 'OpenDocument',
			description: '.odt for LibreOffice',
			action: async () => {
				const { downloadOdt } = await import('$lib/export/odt');
				return downloadOdt(tree, documentTitle);
			},
		},
		{
			id: 'html',
			label: 'HTML',
			description: 'one .html file, images inline',
			action: async () => {
				const { downloadHtml } = await import('$lib/export/html');
				return downloadHtml(tree, documentTitle);
			},
		},
	];
</script>

<Dialog bind:open title="Export document" index="04" meta="{formats.length} formats" size="sm" onclose={onClose}>
	<p class="lede">Pick a format.</p>
	<div class="deck">
		{#each formats as fmt (fmt.id)}
			<Button
				block
				variant="outline"
				sub={exporting === fmt.id ? 'exporting…' : fmt.description}
				disabled={exporting !== null}
				onclick={() => run(fmt.id, fmt.action)}
			>
				{fmt.label}
			</Button>
		{/each}
	</div>
</Dialog>

<style>
	.lede { color: var(--nd-text-dim); }
	.deck { display: flex; flex-direction: column; gap: var(--nd-space-2); }
</style>

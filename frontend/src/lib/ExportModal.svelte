<script lang="ts">
	import { DownloadIcon, FileTextIcon, FileIcon, PrinterIcon, XIcon, CodeIcon } from '@lucide/svelte';
	import { Dialog } from '@skeletonlabs/skeleton-svelte';
	import type { TreeNode } from '$lib/types';

	let { tree, documentTitle, onClose }: { tree: TreeNode[]; documentTitle: string; onClose: () => void } = $props();

	let exporting = $state<string | null>(null);

	// Export modules are lazy-imported inside run() so docx/jszip/etc. are never
	// evaluated during SSR — they use debug's browser.js which accesses localStorage
	// on module load, triggering a Node 26 warning.
	async function run(format: string, fn: () => Promise<void> | void) {
		exporting = format;
		try {
			await fn();
		} finally {
			exporting = null;
		}
	}

	const formats = [
		{
			id: 'markdown',
			label: 'Markdown ZIP',
			description: 'A ZIP archive containing document.md with images alongside',
			icon: FileTextIcon,
			action: async () => {
				const { downloadMarkdownZip } = await import('$lib/export/markdown');
				return downloadMarkdownZip(tree, documentTitle);
			},
		},
		{
			id: 'docx',
			label: 'Word Document',
			description: 'Microsoft Word (.docx) with headings, body text, images, and code blocks',
			icon: FileIcon,
			action: async () => {
				const { downloadDocx } = await import('$lib/export/docxExport');
				return downloadDocx(tree, documentTitle);
			},
		},
		{
			id: 'pdf',
			label: 'PDF (Print)',
			description: 'Opens a print-ready page in a new tab — equations rendered, use browser print to PDF',
			icon: PrinterIcon,
			action: async () => {
				const { printAsPdf } = await import('$lib/export/printPdf');
				return printAsPdf(tree, documentTitle);
			},
		},
		{
			id: 'odt',
			label: 'OpenDocument Text',
			description: 'ODF format (.odt) compatible with LibreOffice and OpenOffice',
			icon: DownloadIcon,
			action: async () => {
				const { downloadOdt } = await import('$lib/export/odt');
				return downloadOdt(tree, documentTitle);
			},
		},
		{
			id: 'html',
			label: 'Self-contained HTML',
			description: 'Single .html file with inline styles and base64 images — easy to share or open offline',
			icon: CodeIcon,
			action: async () => {
				const { downloadHtml } = await import('$lib/export/html');
				return downloadHtml(tree, documentTitle);
			},
		},
	];
</script>

<Dialog
	open={true}
	onOpenChange={(e) => { if (!e.open) onClose(); }}
>
	<Dialog.Backdrop class="fixed inset-0 bg-black/50 z-40" />
	<Dialog.Positioner class="fixed inset-0 z-50 flex items-center justify-center p-4">
		<Dialog.Content class="bg-surface-100-900 rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4">
			<div class="flex items-center justify-between">
				<Dialog.Title class="text-xl font-semibold">Download Document</Dialog.Title>
				<Dialog.CloseTrigger class="btn-icon preset-ghost" aria-label="Close"><XIcon class="size-4" /></Dialog.CloseTrigger>
			</div>

			<p class="text-sm opacity-70">Choose a format to export your document.</p>

			<div class="flex flex-col gap-2">
				{#each formats as fmt}
					<button
						onclick={() => run(fmt.id, fmt.action)}
						disabled={exporting !== null}
						class="flex items-start gap-3 p-3 rounded-lg border border-surface-300-700 hover:bg-surface-200-800 text-left transition disabled:opacity-50"
					>
						<span class="mt-0.5 shrink-0 opacity-70">
							<fmt.icon class="w-5 h-5" />
						</span>
						<div class="flex flex-col">
							<span class="font-medium flex items-center gap-2">
								{fmt.label}
								{#if exporting === fmt.id}
									<span class="text-xs opacity-60">Exporting…</span>
								{/if}
							</span>
							<span class="text-xs opacity-60">{fmt.description}</span>
						</div>
					</button>
				{/each}
			</div>
		</Dialog.Content>
	</Dialog.Positioner>
</Dialog>

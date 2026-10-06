// Save a generated file. Desktop: a native "Save as" dialog through Go.
// Browser: a normal download. Resolves to where it went, or null if cancelled.
import { SaveFile } from '$lib/wailsjs/go/main/App';
import { inWails } from './env';

export async function saveFile(blob: Blob, filename: string): Promise<string | null> {
	if (inWails) {
		const bytes = new Uint8Array(await blob.arrayBuffer());
		let s = '';
		for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
		const path = await SaveFile(filename, btoa(s));
		return path || null;
	}
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 10000);
	return filename;
}

// Print an HTML document (the PDF export: the print dialog has "Save as PDF").
// Desktop: a hidden frame, because the webview can't open pop-up windows.
// Browser: a new tab, as before.
export function printHtml(html: string): boolean {
	if (inWails) {
		const frame = document.createElement('iframe');
		frame.setAttribute('aria-hidden', 'true');
		frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
		frame.srcdoc = html; // the document calls print() on load
		document.body.appendChild(frame);
		setTimeout(() => frame.remove(), 60_000);
		return true;
	}
	const w = window.open('', '_blank');
	if (!w) return false;
	w.document.open();
	w.document.write(html);
	w.document.close();
	return true;
}

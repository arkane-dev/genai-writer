// Text for contenteditable elements. Svelte must not manage the text inside them: each
// re-render resets the caret (typing comes out backwards) and the browser's own edits
// replace the text node Svelte tracks (crash: "reading 'nodes'").
// So this writes the text itself, and only while the element doesn't have focus.
//
//   <div contenteditable {@attach editableText(() => node.label)}></div>
import type { Attachment } from 'svelte/attachments';

export function editableText(get: () => string | null | undefined): Attachment<HTMLElement> {
	return (el) => {
		const value = get() ?? '';
		if (document.activeElement !== el && el.textContent !== value) el.textContent = value;
	};
}

<!-- Attached files on a node: name, size of the extracted text, remove button. -->
<script lang="ts">
	import type { StoredAttachment } from '$lib/types';
	let { attachments = $bindable([]), reading = 0 }: { attachments: StoredAttachment[]; reading?: number } = $props();
</script>

{#if attachments.length || reading}
	<ul class="files">
		{#each attachments as a (a.name)}
			<li>
				<span class="name">{a.name}</span>
				<span class="nd-meta">{a.text ? `${a.text.length.toLocaleString()} chars` : 'no text found'}</span>
				<button type="button" aria-label="Remove {a.name}" onclick={() => (attachments = attachments.filter((x) => x !== a))}>✕</button>
			</li>
		{/each}
		{#if reading}<li class="nd-meta">&gt; reading {reading} file{reading === 1 ? '' : 's'}<span class="nd-cursor"></span></li>{/if}
	</ul>
{/if}

<style>
	.files { margin: var(--nd-space-2) 0 0; padding: 0; list-style: none; border-top: 1px solid var(--nd-line); }
	li { display: flex; align-items: center; gap: var(--nd-space-3); padding: var(--nd-space-1) 0; border-bottom: 1px solid var(--nd-line); }
	.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--nd-text-sm); }
	button { border: 0; background: transparent; color: var(--nd-text-mute); cursor: pointer; }
	button:hover { color: var(--nd-danger); }
</style>

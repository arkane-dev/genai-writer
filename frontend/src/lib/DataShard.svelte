<!-- DataShard: a document drawn as a Cyberpunk data chip. Connector and gold pins on top,
     a cut-corner glass body lit in the document's tone, circuit traces, and a label plate.
     The whole shard is one button: click to open. -->
<script lang="ts" module>
	export const SHARD_TONES = ['magenta', 'cyan', 'yellow', 'jade', 'violet', 'gold'] as const;
</script>

<script lang="ts">
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		docId: number;
		title: string;
		updated: string; // already formatted
		loaded?: boolean; // the open document: glows
	}
	let { docId, title, updated, loaded = false, ...rest }: Props = $props();

	// A stable tone per document, so a shard keeps its colour.
	const tone = $derived(SHARD_TONES[(docId * 7) % SHARD_TONES.length]);
	const code = $derived(`DOC_${String(docId).padStart(4, '0')}`);
	const gid = $derived(`shard-glass-${docId}`);
</script>

<button type="button" class="shard" class:loaded style:--t="var(--nd-{tone})" {...rest}>
	<svg class="art" viewBox="0 0 120 210" preserveAspectRatio="none" aria-hidden="true">
		<defs>
			<linearGradient id={gid} x1="0" y1="0" x2="0.35" y2="1">
				<stop offset="0" style="stop-color: var(--t); stop-opacity: 0.42" />
				<stop offset="0.45" style="stop-color: var(--t); stop-opacity: 0.12" />
				<stop offset="1" style="stop-color: var(--nd-surface-1); stop-opacity: 0.95" />
			</linearGradient>
		</defs>
		<!-- connector + pins -->
		<rect x="38" y="1" width="44" height="26" class="conn" />
		{#each [0, 1, 2, 3, 4, 5] as i (i)}<rect x={42.5 + i * 6} y="5" width="2.5" height="15" class="pin" />{/each}
		<polygon points="30,26 90,26 96,36 24,36" class="collar" />
		<!-- body: top-left and bottom-right cut -->
		<polygon points="0,50 14,36 120,36 120,196 106,210 0,210" class="body" style:fill="url(#{gid})" />
		<polygon points="8,54 18,44 112,44 112,192 102,202 8,202" class="glass" />
		<!-- die and traces -->
		<rect x="47" y="58" width="26" height="26" class="die" />
		<rect x="53" y="64" width="14" height="14" class="core" />
		<polyline points="47,66 30,66 30,96 18,96" class="trace" />
		<polyline points="47,76 36,76 36,118" class="trace" />
		<polyline points="73,64 92,64 92,90 104,90" class="trace" />
		<polyline points="73,78 84,78 84,112 96,112" class="trace" />
		<polyline points="60,84 60,104 70,104" class="trace" />
		{#each [[16, 94], [34, 116], [102, 88], [94, 110], [68, 102]] as [x, y], i (i)}<rect x={x} y={y} width="4" height="4" class="pad" />{/each}
	</svg>

	<!-- The visible text is the accessible name (WCAG 2.5.3), with "Open" in front for screen readers. -->
	<span class="plate">
		<span class="sr">Open</span>
		<span class="code">{code}</span>
		<span class="title">{title || 'Untitled'}</span>
		<span class="date">{updated}</span>
	</span>
	{#if loaded}<span class="badge">loaded</span>{/if}
</button>

<style>
	.shard {
		--lift: 0px;
		position: relative;
		display: block;
		flex: none;
		width: 8.25rem;
		height: 14.5rem;
		padding: 0;
		border: 0;
		background: transparent;
		color: var(--nd-text);
		text-align: left;
		cursor: pointer;
		transform: translateY(var(--lift));
		transition: transform var(--nd-dur-base) var(--nd-ease), filter var(--nd-dur-base) var(--nd-ease);
	}
	/* Pull it off the shelf a little on hover or focus. */
	.shard:hover,
	.shard:focus-visible { --lift: -8px; filter: drop-shadow(0 0 6px color-mix(in srgb, var(--t) 55%, transparent)); }
	.shard.loaded { filter: drop-shadow(0 0 8px color-mix(in srgb, var(--t) 70%, transparent)); }
	.shard:focus-visible { outline: 2px solid var(--nd-focus); outline-offset: 4px; }
	.shard:active { --lift: -4px; }
	@media (prefers-reduced-motion: reduce) {
		.shard { transition: none; }
		.shard:hover, .shard:focus-visible { --lift: 0px; }
	}
	@media (prefers-contrast: more) {
		.shard:hover, .shard:focus-visible, .shard.loaded { filter: none; }
	}

	.art { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
	.conn { fill: var(--nd-surface-3); stroke: var(--t); stroke-width: 1; }
	.pin { fill: var(--nd-gold); }
	.collar { fill: var(--nd-surface-2); stroke: var(--t); stroke-width: 1; }
	.body { stroke: var(--t); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
	.glass { fill: none; stroke: var(--t); stroke-opacity: 0.3; stroke-width: 1; vector-effect: non-scaling-stroke; }
	.die { fill: var(--nd-void); stroke: var(--t); stroke-width: 1; }
	.core { fill: var(--t); fill-opacity: 0.55; }
	.trace { fill: none; stroke: var(--t); stroke-opacity: 0.5; stroke-width: 1; vector-effect: non-scaling-stroke; }
	.pad { fill: var(--t); fill-opacity: 0.8; }

	.plate {
		position: absolute;
		right: 0.75rem;
		bottom: 0.9rem;
		left: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.45rem 0.5rem;
		border-left: 2px solid var(--t);
		background: color-mix(in srgb, var(--nd-void) 88%, transparent);
	}
	.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
	.code { font-family: var(--nd-font-mono); font-size: var(--nd-text-2xs); color: var(--t); }
	.title {
		display: -webkit-box;
		overflow: hidden;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		font-family: var(--nd-font-ui);
		font-size: var(--nd-text-sm);
		font-weight: 700;
		line-height: 1.15;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		overflow-wrap: anywhere;
	}
	.date { font-family: var(--nd-font-mono); font-size: var(--nd-text-2xs); color: var(--nd-text-mute); }
	.badge {
		position: absolute;
		top: 2.75rem;
		right: 0.5rem;
		padding: 0.05rem 0.35rem;
		background: var(--t);
		color: var(--nd-text-on-neon);
		font-family: var(--nd-font-mono);
		font-size: var(--nd-text-2xs);
		text-transform: uppercase;
	}
</style>

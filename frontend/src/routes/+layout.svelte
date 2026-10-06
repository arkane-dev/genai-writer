<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { page } from '$app/stores';
	import { AppBar, Navigation, Toast } from '@skeletonlabs/skeleton-svelte';
	import { SettingsIcon } from '@lucide/svelte';
	import { toaster } from '$lib/toaster';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<Toast.Group {toaster}>
	{#snippet children(toast)}
		<Toast {toast} class="card p-4 flex gap-4 items-start shadow-xl min-w-[280px] max-w-sm">
			<div class="flex-1">
				<Toast.Title class="font-semibold text-sm" />
				<Toast.Description class="text-sm opacity-80" />
			</div>
			<Toast.CloseTrigger class="btn-icon preset-tonal-surface btn-sm">✕</Toast.CloseTrigger>
		</Toast>
	{/snippet}
</Toast.Group>

<div class="grid h-screen grid-rows-[auto_1fr_auto]">
	<!-- Header -->
	<AppBar class="bg-primary-950 text-surface-50 px-4">
		<AppBar.Lead>
			<span class="font-bold text-lg">AI Writer</span>
		</AppBar.Lead>
		<AppBar.Trail>
			<a href="#/admin" class="hover:opacity-75 transition-opacity" aria-label="Settings">
				<SettingsIcon class="size-5" />
			</a>
		</AppBar.Trail>
	</AppBar>

	<!-- Body columns -->
	<div class="grid grid-cols-1 md:grid-cols-[auto_1fr] overflow-hidden">
		<!-- Sidebar -->
		<Navigation layout="sidebar" class="bg-primary-200 p-4 overflow-y-auto">
			<Navigation.Menu>
				<Navigation.Group>
					<a
						href="#/"
						class="block p-2 rounded-md hover:bg-primary-300 transition-colors {($page.url.hash || '#/') === '#/' ? 'bg-primary-300 font-medium' : ''}"
					>
						Editor
					</a>
					<a
						href="#/documents"
						class="block p-2 rounded-md hover:bg-primary-300 transition-colors {($page.url.hash || '#/') === '#/documents' ? 'bg-primary-300 font-medium' : ''}"
					>
						Documents
					</a>
					<a
						href="#/admin"
						class="block p-2 rounded-md hover:bg-primary-300 transition-colors {($page.url.hash || '#/') === '#/admin' ? 'bg-primary-300 font-medium' : ''}"
					>
						Settings
					</a>
				</Navigation.Group>
			</Navigation.Menu>
		</Navigation>

		<!-- Main content -->
		<main class="bg-surface-50 p-4 overflow-auto">
			<div class="w-full lg:max-w-[75%] mx-auto space-y-4">
				{@render children()}
			</div>
		</main>
	</div>

	<!-- Footer -->
	<footer class="bg-primary-950 text-surface-50 p-4">
		<p>&copy; 2026</p>
	</footer>
</div>

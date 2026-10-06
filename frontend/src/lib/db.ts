import Dexie, { type Table } from 'dexie';

import type { Folder, Document, Snapshot, Snippet } from '$lib/platform/store.svelte';

export type { Folder, Document, Snapshot, Snippet };

// Browser build only. The desktop app keeps its library on disk through Go.
export class AppDB extends Dexie {
	folders!: Table<Folder>;
	documents!: Table<Document>;
	snapshots!: Table<Snapshot>;
	snippets!: Table<Snippet>;

	constructor() {
		super('ai-writer');

		// v1: snapshots only (no documentId)
		this.version(1).stores({
			snapshots: '++id, timestamp',
		});

		// v2: multi-document support
		// Migration: stamp all existing snapshots with documentId:1 and
		// create the corresponding "Untitled Document" record.
		this.version(2)
			.stores({
				folders: '++id, parentId',
				documents: '++id, folderId',
				snapshots: '++id, documentId, timestamp',
			})
			.upgrade(async (tx) => {
				const existing = await tx.table('snapshots').toArray();
				if (existing.length === 0) return;

				// Create the default document (will get id=1 since table is empty)
				await tx.table('documents').add({
					title: 'Untitled Document',
					folderId: null,
					createdAt: Date.now(),
					updatedAt: Date.now(),
				});

				// Stamp all existing snapshots with documentId: 1
				await Promise.all(
					existing.map((s) => tx.table('snapshots').update(s.id, { documentId: 1 }))
				);
			});

		// v3: reusable snippets (one saved node subtree each)
		this.version(3).stores({
			folders: '++id, parentId',
			documents: '++id, folderId',
			snapshots: '++id, documentId, timestamp',
			snippets: '++id, createdAt',
		});
	}
}

export const db = new AppDB();

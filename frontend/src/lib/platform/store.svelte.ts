// Document library: folders, documents, snapshots (history) and snippets.
// Desktop: plain JSON files on disk through Go (see store.go). Browser: IndexedDB through Dexie.
// Pages read through `store` and re-read when `library.version` changes (it bumps after every write).
import * as Go from '$lib/wailsjs/go/main/Store';
import type { main } from '$lib/wailsjs/go/models';
import { inWails } from './env';

export interface Folder {
	id?: number;
	name: string;
	parentId: number | null;
	createdAt: number;
}

export interface Document {
	id?: number;
	title: string;
	folderId: number | null;
	createdAt: number;
	updatedAt: number;
}

export interface Snapshot {
	id?: number;
	documentId: number;
	timestamp: number;
	message: string;
	tree: string; // JSON-serialized tree (File/Blob fields stripped)
}

export interface Snippet {
	id?: number;
	name: string;
	description: string;
	tree: string; // one JSON-serialized node
	createdAt: number;
}

export type DocumentPatch = Partial<Pick<Document, 'title' | 'folderId' | 'updatedAt'>>;

export interface Store {
	listFolders(): Promise<Folder[]>; // by name
	addFolder(f: Folder): Promise<number>;
	renameFolder(id: number, name: string): Promise<void>;
	deleteFolder(id: number): Promise<void>; // its documents move to the top level
	listDocuments(): Promise<Document[]>; // most recently updated first
	getDocument(id: number): Promise<Document | undefined>;
	addDocument(d: Document): Promise<number>;
	updateDocument(id: number, patch: DocumentPatch): Promise<void>;
	deleteDocument(id: number): Promise<void>; // and its history
	addSnapshot(s: Snapshot): Promise<number>;
	getSnapshot(documentId: number, id: number): Promise<Snapshot | undefined>;
	listSnapshots(documentId: number): Promise<Snapshot[]>; // oldest first
	clearSnapshots(documentId: number | null): Promise<void>; // null = every document
	listSnippets(): Promise<Snippet[]>; // newest first
	addSnippet(s: Snippet): Promise<number>;
	deleteSnippet(id: number): Promise<void>;
}

// Go can't send undefined; it sends null. Normalise both ways.
const orUndefined = <T>(v: T | null | undefined): T | undefined => v ?? undefined;

const goStore: Store = {
	listFolders: async () => (await Go.ListFolders()) as Folder[],
	addFolder: (f) => Go.AddFolder(f as main.Folder),
	renameFolder: (id, name) => Go.RenameFolder(id, name),
	deleteFolder: (id) => Go.DeleteFolder(id),
	listDocuments: async () => (await Go.ListDocuments()) as Document[],
	getDocument: async (id) => orUndefined((await Go.GetDocument(id)) as Document | null),
	addDocument: (d) => Go.AddDocument(d as main.Document),
	updateDocument: (id, p) =>
		Go.UpdateDocument(id, {
			title: p.title,
			folderId: p.folderId ?? undefined,
			moveFolder: 'folderId' in p,
			updatedAt: p.updatedAt
		} as main.DocumentPatch),
	deleteDocument: (id) => Go.DeleteDocument(id),
	addSnapshot: (s) => Go.AddSnapshot(s as main.Snapshot),
	getSnapshot: async (docId, id) => orUndefined((await Go.GetSnapshot(docId, id)) as Snapshot | null),
	listSnapshots: async (docId) => (await Go.ListSnapshots(docId)) ?? [],
	clearSnapshots: (docId) => Go.ClearSnapshots(docId ?? 0),
	listSnippets: async () => (await Go.ListSnippets()) ?? [],
	addSnippet: (s) => Go.AddSnippet(s as main.Snippet),
	deleteSnippet: (id) => Go.DeleteSnippet(id)
};

// Dexie loads lazily so the desktop build never opens IndexedDB.
const dexie = async () => (await import('$lib/db')).db;

const dexieStore: Store = {
	// 'name' isn't an index, so sort here (orderBy('name') throws a SchemaError).
	listFolders: async () => (await (await dexie()).folders.toArray()).sort((a, b) => a.name.localeCompare(b.name)),
	addFolder: async (f) => (await (await dexie()).folders.add(f)) as number,
	renameFolder: async (id, name) => void (await (await dexie()).folders.update(id, { name })),
	deleteFolder: async (id) => {
		const db = await dexie();
		await db.transaction('rw', db.documents, db.folders, async () => {
			await db.documents.where('folderId').equals(id).modify({ folderId: null });
			await db.folders.delete(id);
		});
	},
	listDocuments: async () => (await (await dexie()).documents.toArray()).sort((a, b) => b.updatedAt - a.updatedAt),
	getDocument: async (id) => (await dexie()).documents.get(id),
	addDocument: async (d) => (await (await dexie()).documents.add(d)) as number,
	updateDocument: async (id, p) => void (await (await dexie()).documents.update(id, p)),
	deleteDocument: async (id) => {
		const db = await dexie();
		await db.transaction('rw', db.documents, db.snapshots, async () => {
			await db.snapshots.where('documentId').equals(id).delete();
			await db.documents.delete(id);
		});
	},
	addSnapshot: async (s) => (await (await dexie()).snapshots.add(s)) as number,
	getSnapshot: async (_docId, id) => (await dexie()).snapshots.get(id),
	listSnapshots: async (docId) => (await dexie()).snapshots.where('documentId').equals(docId).sortBy('timestamp'),
	clearSnapshots: async (docId) => {
		const db = await dexie();
		if (docId === null) await db.snapshots.clear();
		else await db.snapshots.where('documentId').equals(docId).delete();
	},
	listSnippets: async () => (await (await dexie()).snippets.toArray()).sort((a, b) => b.createdAt - a.createdAt),
	addSnippet: async (s) => (await (await dexie()).snippets.add(s)) as number,
	deleteSnippet: async (id) => void (await (await dexie()).snippets.delete(id))
};

let version = $state(0);

/** Read `library.version` inside an $effect to re-run it after any write. */
export const library = {
	get version() {
		return version;
	}
};

// Wrap every write so readers refresh, like Dexie's liveQuery did.
const writes = new Set<keyof Store>([
	'addFolder', 'renameFolder', 'deleteFolder', 'addDocument', 'updateDocument', 'deleteDocument',
	'addSnapshot', 'clearSnapshots', 'addSnippet', 'deleteSnippet'
]);

function withChangeSignal(s: Store): Store {
	const out = { ...s };
	for (const key of writes) {
		const fn = s[key] as (...args: unknown[]) => Promise<unknown>;
		(out as Record<string, unknown>)[key] = async (...args: unknown[]) => {
			const result = await fn(...args);
			version++;
			return result;
		};
	}
	return out;
}

export const store: Store = withChangeSignal(inWails ? goStore : dexieStore);

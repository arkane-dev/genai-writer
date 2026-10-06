export interface DiffEntry {
	type: 'added' | 'removed' | 'changed';
	nodeId: string;
	nodeLabel: string;
	nodeType: string;
	field?: string;
	oldValue?: unknown;
	newValue?: unknown;
}

const TRACKED_FIELDS = [
	'label', 'desc', 'content', 'description', 'purpose',
	'key_points', 'conclusion', 'additional_details',
	'generate', 'generated_content', 'references',
	'storedAttachments', 'altText', 'imageUrl',
];

import type { TreeNode } from '$lib/types';

function flattenTree(nodes: TreeNode[], map = new Map<string, TreeNode>()): Map<string, TreeNode> {
	for (const node of nodes) {
		map.set(node.id, node);
		if (node.children?.length) flattenTree(node.children, map);
	}
	return map;
}

export function diffTrees(oldTree: TreeNode[], newTree: TreeNode[]): DiffEntry[] {
	const diffs: DiffEntry[] = [];
	const oldMap = flattenTree(oldTree);
	const newMap = flattenTree(newTree);

	for (const [id, node] of newMap) {
		if (!oldMap.has(id)) {
			diffs.push({ type: 'added', nodeId: id, nodeLabel: node.label, nodeType: node.type });
		}
	}
	for (const [id, node] of oldMap) {
		if (!newMap.has(id)) {
			diffs.push({ type: 'removed', nodeId: id, nodeLabel: node.label, nodeType: node.type });
		}
	}
	for (const [id, newNode] of newMap) {
		const oldNode = oldMap.get(id);
		if (!oldNode) continue;
		const oldRec = oldNode as unknown as Record<string, unknown>;
		const newRec = newNode as unknown as Record<string, unknown>;
		for (const field of TRACKED_FIELDS) {
			const oldVal = JSON.stringify(oldRec[field] ?? null);
			const newVal = JSON.stringify(newRec[field] ?? null);
			if (oldVal !== newVal) {
				diffs.push({
					type: 'changed',
					nodeId: id,
					nodeLabel: newNode.label,
					nodeType: newNode.type,
					field,
					oldValue: oldRec[field],
					newValue: newRec[field],
				});
			}
		}
	}
	return diffs;
}

export function describeChanges(diffs: DiffEntry[]): string {
	if (diffs.length === 0) return 'No changes';
	if (diffs.length === 1) {
		const d = diffs[0];
		const t = d.nodeType.replace('_', ' ');
		if (d.type === 'added') return `Added ${t} "${d.nodeLabel}"`;
		if (d.type === 'removed') return `Deleted ${t} "${d.nodeLabel}"`;
		if (d.type === 'changed') return `Updated ${d.field?.replace(/_/g, ' ')} in "${d.nodeLabel}"`;
	}
	const adds = diffs.filter(d => d.type === 'added').length;
	const removes = diffs.filter(d => d.type === 'removed').length;
	const changes = diffs.filter(d => d.type === 'changed').length;
	const parts: string[] = [];
	if (adds) parts.push(`${adds} added`);
	if (removes) parts.push(`${removes} removed`);
	if (changes) parts.push(`${changes} field${changes > 1 ? 's' : ''} changed`);
	return parts.join(', ');
}

export function serializeTree(nodes: TreeNode[]): TreeNode[] {
	return nodes.map(node => ({
		...node,
		attachments: [],
		imageFile: null,
		children: node.children ? serializeTree(node.children) : [],
	}));
}

export function formatTimestamp(ts: number): string {
	return new Date(ts).toLocaleString();
}

export function relativeTime(ts: number): string {
	const s = Math.floor((Date.now() - ts) / 1000);
	if (s < 60) return `${s}s ago`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	return `${Math.floor(h / 24)}d ago`;
}

export function formatDiffValue(val: unknown): string {
	if (val === null || val === undefined || val === '') return '(empty)';
	if (Array.isArray(val)) return val.length ? val.join(', ') : '(none)';
	const s = String(val);
	return s.length > 120 ? s.slice(0, 120) + '…' : s;
}

import type { TreeNode } from '$lib/types';

let _node = $state<TreeNode | null>(null);

export const clipboardState = {
	get node() { return _node; },
	copy(node: TreeNode) { _node = node; },
	clear() { _node = null; },
};

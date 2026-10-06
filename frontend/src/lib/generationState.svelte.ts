import type { TreeNode, DocumentOptions } from '$lib/types';

const state = $state({
	tree: [] as TreeNode[],
	documentTitle: '',
	documentOptions: {
		generateExecutiveSummary: false,
		generateIntroduction: false,
		generateConclusion: false,
		generateReferences: false,
	} as DocumentOptions,
	documentId: null as number | null,
	status: 'idle' as 'idle' | 'generating' | 'done' | 'error',
	currentNodeId: null as string | null,
	currentNodeLabel: '',
	completedNodes: [] as string[],
	error: null as string | null,
	uidCurrent: 100,
});

export const generationState = state;

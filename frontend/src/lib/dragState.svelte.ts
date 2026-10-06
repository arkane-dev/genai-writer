// Module-level drag state shared across all TreeNode instances.
// Native HTML5 drag-and-drop requires this because dataTransfer.getData()
// returns empty string during dragover (browsers restrict it for security).
let _draggedId = $state<string | null>(null);
let _draggedType = $state<string | null>(null);

// Touch drag drop target — set during touchmove so target nodes can show indicators.
let _touchDropTargetId = $state<string | null>(null);
let _touchDropZone = $state<'before' | 'after' | 'inside' | null>(null);

export const dragState = {
	get draggedId() { return _draggedId; },
	get draggedType() { return _draggedType; },
	get touchDropTargetId() { return _touchDropTargetId; },
	get touchDropZone() { return _touchDropZone; },
	start(id: string, type: string) { _draggedId = id; _draggedType = type; },
	end() { _draggedId = null; _draggedType = null; },
	setTouchDrop(id: string, zone: 'before' | 'after' | 'inside') {
		_touchDropTargetId = id;
		_touchDropZone = zone;
	},
	clearTouchDrop() { _touchDropTargetId = null; _touchDropZone = null; },
};

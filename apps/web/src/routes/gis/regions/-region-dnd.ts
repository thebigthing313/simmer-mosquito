import type React from 'react';
import { useMemo, useState } from 'react';

/** Drag payload type + a sentinel drop key for the "move out of any folder" zone. */
export const REGION_DND_TYPE = 'application/x-simmer-region';
export const UNFILED_DROP_KEY = '__unfiled__';

/** Shared drag-and-drop wiring threaded down to rows (sources) and folders (targets). */
export interface RegionDnd {
	readonly draggingId: string | null;
	readonly dropTargetKey: string | null;
	readonly onDragStart: (id: string) => void;
	readonly onDragEnd: () => void;
	readonly onDragOverTarget: (key: string) => void;
	readonly onDropRegion: (regionId: string, folderId: string | null) => void;
}

/** dragover guard: accept only region drags, and signal a "move" cursor. */
export function allowRegionDrop(event: React.DragEvent<HTMLElement>): boolean {
	if (!event.dataTransfer.types.includes(REGION_DND_TYPE)) {
		return false;
	}
	event.preventDefault();
	event.dataTransfer.dropEffect = 'move';
	return true;
}

export function readDraggedRegionId(event: React.DragEvent<HTMLElement>): string | null {
	const id = event.dataTransfer.getData(REGION_DND_TYPE);
	return id.length > 0 ? id : null;
}

/**
 * Transient drag state for the region tree, plus the move it commits on drop.
 *
 * The drop clears `draggingId` itself rather than waiting for `dragend`: a drop
 * onto another folder re-parents the row, so React unmounts the element the
 * drag started from and its `dragend` never fires. Left to that handler alone,
 * the moved region would keep rendering in its dragging style until the next
 * full re-render.
 */
export function useRegionDnd(
	onMove: (regionId: string, folderId: string | null) => void,
): RegionDnd {
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);

	return useMemo<RegionDnd>(
		() => ({
			draggingId,
			dropTargetKey,
			onDragStart: (id) => setDraggingId(id),
			onDragEnd: () => {
				setDraggingId(null);
				setDropTargetKey(null);
			},
			onDragOverTarget: (key) => setDropTargetKey(key),
			onDropRegion: (regionId, folderId) => {
				setDraggingId(null);
				setDropTargetKey(null);
				onMove(regionId, folderId);
			},
		}),
		[draggingId, dropTargetKey, onMove],
	);
}

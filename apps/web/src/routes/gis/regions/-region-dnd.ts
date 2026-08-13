import type React from 'react';
import { useMemo, useState } from 'react';

/** Drag payload type. The dragged region's id travels as this MIME type's data. */
export const REGION_DND_TYPE = 'application/x-simmer-region';

/**
 * Where a drop would put the region. `unfiled` is a place in the tree, not a
 * folder, so it gets its own arm rather than a sentinel id sharing the string
 * space real folder ids live in.
 */
export type RegionDropTarget =
	| { readonly kind: 'folder'; readonly folderId: string }
	| { readonly kind: 'unfiled' };

/** Shared drag-and-drop wiring threaded down to rows (sources) and folders (targets). */
export interface RegionDnd {
	readonly draggingId: string | null;
	readonly dropTarget: RegionDropTarget | null;
	readonly onDragStart: (id: string) => void;
	readonly onDragEnd: () => void;
	readonly onDragOverTarget: (target: RegionDropTarget) => void;
	readonly onDropRegion: (regionId: string, folderId: string | null) => void;
}

/** The folder id a drop on this target writes: `null` for unfiled. */
export function dropTargetFolderId(target: RegionDropTarget): string | null {
	return target.kind === 'folder' ? target.folderId : null;
}

/** Whether `target` is the zone the current drag is hovering, for its highlight. */
export function isHoveredDropTarget(dnd: RegionDnd, target: RegionDropTarget): boolean {
	if (dnd.draggingId === null || dnd.dropTarget === null) {
		return false;
	}
	if (dnd.dropTarget.kind === 'unfiled' || target.kind === 'unfiled') {
		return dnd.dropTarget.kind === target.kind;
	}
	return dnd.dropTarget.folderId === target.folderId;
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
 * The handlers that make an element a drop zone for `target`.
 *
 * Spread onto the element that wraps a group's header *and* its rows, not the
 * header alone: a region already in the group is part of the target you are
 * aiming at, and the empty-group hint that says so renders below the header.
 * Rows set no drop handler of their own, so a drop on one bubbles up to here.
 */
export function regionDropZoneProps(
	dnd: RegionDnd,
	target: RegionDropTarget,
): Pick<React.HTMLAttributes<HTMLElement>, 'onDragOver' | 'onDrop'> {
	return {
		onDragOver: (event) => {
			if (allowRegionDrop(event)) {
				dnd.onDragOverTarget(target);
			}
		},
		onDrop: (event) => {
			if (!allowRegionDrop(event)) {
				return;
			}
			const id = readDraggedRegionId(event);
			if (id !== null) {
				dnd.onDropRegion(id, dropTargetFolderId(target));
			}
		},
	};
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
	onMove: (regionId: string, folderId: string | null) => void | Promise<void>,
): RegionDnd {
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [dropTarget, setDropTarget] = useState<RegionDropTarget | null>(null);

	return useMemo<RegionDnd>(
		() => ({
			draggingId,
			dropTarget,
			onDragStart: (id) => setDraggingId(id),
			onDragEnd: () => {
				setDraggingId(null);
				setDropTarget(null);
			},
			onDragOverTarget: (target) => setDropTarget(target),
			onDropRegion: (regionId, folderId) => {
				setDraggingId(null);
				setDropTarget(null);
				void onMove(regionId, folderId);
			},
		}),
		[draggingId, dropTarget, onMove],
	);
}

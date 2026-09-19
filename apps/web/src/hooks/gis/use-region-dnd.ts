import { useState } from 'react';
import type { RegionDnd, RegionDropTarget } from '../../components/gis/regions/region-dnd';

/**
 * Transient drag state for the region tree, plus the move it commits on drop.
 * The drop clears the dragging id itself rather than waiting for `dragend`.
 */
export function useRegionDnd(
	onMove: (regionId: string, folderId: string | null) => void | Promise<void>,
): RegionDnd {
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [dropTarget, setDropTarget] = useState<RegionDropTarget | null>(null);

	return {
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
	};
}

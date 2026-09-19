import type { PlanarPosition } from '@simmer-mosquito/mapping';
import {
	continuedPartOf,
	type DrawContinueDraft,
	type DrawEditDraft,
	type DrawGeometry,
	type DrawHoleDraft,
	editDraftOf,
	holeDraftOf,
	type Mode,
} from '../../components/map/draw-parts';

/**
 * The draw in progress as the toolbar and the map both read it: the hole being
 * cut, the part being continued, and the part being edited, recomputed from the
 * committed parts and the vertices placed so far.
 */
export function useDrawDrafts(
	mode: Mode,
	value: DrawGeometry | null,
	vertices: readonly PlanarPosition[],
): {
	readonly holeDraft: DrawHoleDraft | null;
	readonly continuedPart: DrawContinueDraft | null;
	readonly editedPart: DrawEditDraft | null;
} {
	return {
		holeDraft: holeDraftOf(mode, value, vertices),
		continuedPart: continuedPartOf(mode, value, vertices),
		editedPart: editDraftOf(mode, value),
	};
}

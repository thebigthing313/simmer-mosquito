import type { DrawVertexRef, PlanarPosition } from '@simmer-mosquito/mapping';
import type {
	DrawContinueDraft,
	DrawEditDraft,
	DrawGeometry,
	DrawGeometryType,
	DrawHoleDraft,
	DrawProgress,
} from './draw-parts';

/**
 * The draw controller surface the form panel and the on-map toolbar both drive.
 * `start` is wired to the form's "Draw geometry" button; `finish`/`cancel`/`undo`
 * live on the floating map toolbar so the user exits draw mode from the map.
 */
export interface MapDrawController extends DrawProgress {
	readonly isDrawing: boolean;
	/** The draw in progress appends a part rather than replacing the shape. */
	readonly isAddingPart: boolean;
	readonly isRequestingPoint: boolean;
	readonly start: (type: DrawGeometryType) => void;
	/**
	 * Draw one more part of the shape already committed, leaving the rest of it on
	 * the map to draw against. A no-op with nothing committed: the first part is
	 * `start`'s.
	 */
	readonly startPart: () => void;
	/**
	 * Cut a hole into the part at `index`, leaving the rest of the shape on the
	 * map to draw against. The part is named before the gesture starts, so nothing
	 * is hit-tested to work out which part the hole belongs to.
	 *
	 * A no-op for a part that is not an area, and for an index no part holds.
	 */
	readonly startHole: (index: number) => void;
	/**
	 * Draw the part at `index` again from where it stops, its vertices already
	 * placed and the next click appending to them. Finish closes it, Cancel puts
	 * it back as it was.
	 *
	 * A no-op for a point, which is one position and has no end to pick up from,
	 * and for an index no part holds. Undo is deliberately not this: it pops
	 * inside the part being drawn and stops at zero, so reopening a finished part
	 * is something the user asks for.
	 */
	readonly continuePart: (index: number) => void;
	/** The part being continued, or null while the draw is not one. */
	readonly continuedPart: DrawContinueDraft | null;
	/**
	 * Open the part at `index` for vertex editing: every ring it has, shell and
	 * holes, seeded into a draft that drags, inserts and deletes corners. Finish
	 * puts it back at the index it came from, Cancel leaves it as it was.
	 *
	 * A no-op for an index no part holds. A point is **not** a no-op here, unlike
	 * {@link continuePart}: it is one position, so there is no end to carry on
	 * from, but there is a corner to pick up and move. Insert and Delete have
	 * nothing to act on there, and dropping the position would leave a piece with
	 * no way back, which is what `removePart` is for.
	 */
	readonly editPart: (index: number) => void;
	/** The part being edited, or null while the draw is not one. */
	readonly editedPart: DrawEditDraft | null;
	/** Put one vertex of the open edit at `position`. */
	readonly moveVertex: (vertex: DrawVertexRef, position: PlanarPosition) => void;
	/**
	 * Put `position` on the edge that starts at `edge`, between its two ends
	 * rather than at the end of the ring, and pick the new vertex.
	 */
	readonly insertVertex: (edge: DrawVertexRef, position: PlanarPosition) => void;
	/** Drop one vertex of the open edit, below the ring minimum included. */
	readonly deleteVertex: (vertex: DrawVertexRef) => void;
	/**
	 * Start sketching a line across the open part's outline. The stretch of the
	 * outline between the sketch's first and last crossing is replaced by the
	 * sketch, so a sketch running outside the part extends it and one running
	 * inside carves it away. {@link finish} lands the sketch, and the one after
	 * that commits the part.
	 *
	 * A no-op with no edit open, and for a point, which has one corner and no
	 * boundary for a line to cross. The holes the part already had are carried
	 * through untouched: reshaping a hole ring is not this gesture.
	 */
	readonly startReshape: () => void;
	/**
	 * Start sketching a line across the open part, cutting it in two along the
	 * line. {@link finish} commits both pieces in place of the one, at the index
	 * the part came from.
	 *
	 * One press of Finish rather than {@link startReshape}'s two: two pieces are
	 * not something one edit draft can go on holding, so the split lands and the
	 * part list takes over.
	 *
	 * A no-op with no edit open and for a point. It is offered on a record kind
	 * that cannot store a second piece and refuses there, because the refusal is
	 * the answer to why the tool did nothing.
	 */
	readonly startSplit: () => void;
	/** Pick the vertex Delete acts on, or clear the pick with `null`. */
	readonly selectVertex: (vertex: DrawVertexRef | null) => void;
	/** Drop one part, demoting to the base shape at one and to nothing at zero. */
	readonly removePart: (index: number) => void;
	/** Drop one hole from one part, leaving the part itself alone. */
	readonly removeHole: (partIndex: number, holeIndex: number) => void;
	/** The hole in progress, or null while the draw is not one. */
	readonly holeDraft: DrawHoleDraft | null;
	/** Pick out one part on the map, or clear the highlight with `null`. */
	readonly highlightPart: (index: number | null) => void;
	readonly zoomToPart: (index: number) => void;
	readonly finish: () => void;
	readonly cancel: () => void;
	readonly undo: () => void;
	/**
	 * Adopt a geometry the user obtained some other way — an existing region's
	 * boundary, a shape read out of an uploaded file — as if it had just been
	 * drawn. Any in-progress draw is abandoned so the map shows only the result.
	 */
	readonly commit: (geometry: DrawGeometry | null) => void;
	/**
	 * Capture a single map click as a point — used by the address subform's
	 * "place on map" path. Resolves on the next click, rejects if superseded.
	 */
	readonly requestPoint: (prompt?: string) => Promise<DrawGeometry & { readonly type: 'Point' }>;
}

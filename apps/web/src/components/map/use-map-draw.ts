import { mapInteraction } from '@simmer-mosquito/design-tokens';
import {
	type BaseGeometryType,
	geometryCoversGround,
	getMultipartGeometryType,
	isBaseGeometryType,
	isSupportedGeometryType,
	type OwnedGeometryKind,
	ownedGeometryAllowsParts,
} from '@simmer-mosquito/domain';
import {
	boundsFromGeoJson,
	type GeoJsonGeometry,
	geometryContainsLngLat,
	reshapePath,
	splitRings,
} from '@simmer-mosquito/mapping';
import type {
	CircleLayerSpecification,
	ExpressionSpecification,
	FillLayerSpecification,
	GeoJSONSource,
	LineLayerSpecification,
	Map as MapboxMap,
	MapMouseEvent,
	PointLike,
} from 'mapbox-gl';
import {
	type Dispatch,
	type SetStateAction,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
import {
	closeRing,
	type DrawPosition,
	type DrawRing,
	type DrawVertexRef,
	hasDistinctPositions,
	insertRingVertex,
	moveRingVertex,
	nearestRingEdge,
	removeRingVertex,
	samePosition,
	unclosedRing,
} from './draw-vertex-edit';
import { isAimedAtMap } from './map-keys';
import { useGeoJsonSource } from './use-geojson-source';
import { isMapLive } from './use-mapbox-map';

type PolygonRings = readonly DrawRing[];

/**
 * The shape the type toggle offers, which is the domain's base shapes.
 *
 * Deliberately not `DrawGeometry['type']`. A record promotes to its multi shape
 * on gaining a second part and demotes on losing one, so a multi shape is
 * something the control arrives at and never something the user picks.
 */
export type DrawGeometryType = BaseGeometryType;

/**
 * A geometry a record form can produce. Mirrors the GeoJSON shape a command's
 * `locationSource.geometry` expects, so a finished draft can be handed straight
 * to the optimistic mutation without translation.
 *
 * All six shapes, because the control draws in parts. Positions are pairs rather
 * than the domain's optional triple: nothing here places an altitude and the
 * point paths read `coordinates[0]` and `[1]` directly.
 */
export type DrawGeometry =
	| { readonly type: 'Point'; readonly coordinates: DrawPosition }
	| { readonly type: 'LineString'; readonly coordinates: DrawRing }
	| { readonly type: 'Polygon'; readonly coordinates: PolygonRings }
	| { readonly type: 'MultiPoint'; readonly coordinates: DrawRing }
	| { readonly type: 'MultiLineString'; readonly coordinates: PolygonRings }
	| { readonly type: 'MultiPolygon'; readonly coordinates: readonly PolygonRings[] };

/**
 * One part of a drawn shape, carried as the single-part geometry it would be on
 * its own.
 *
 * A part is a geometry rather than a bare coordinate list so that everything
 * already written against a geometry works on one: the map renders it, the
 * bounds reader frames it, and the part row labels it.
 */
export type DrawPartGeometry = Extract<DrawGeometry, { readonly type: DrawGeometryType }>;

/**
 * Whether `value` names a shape the type toggle offers.
 *
 * The domain's register is what says which shapes exist; three files used to
 * spell the same three names out by hand instead.
 */
export function isDrawGeometryType(value: unknown): value is DrawGeometryType {
	return isBaseGeometryType(value);
}

/**
 * Read a stored geometry back into something the draw flow can edit.
 *
 * All six shapes now, because the part list is the affordance whose absence used
 * to justify reading a multi shape as "no geometry" and quietly leaving the
 * record whatever it held. A `GeometryCollection` still reads as none: it has no
 * `coordinates`, and the parts of one are not parts of a single shape.
 */
export function toDrawGeometry(geojson: unknown): DrawGeometry | null {
	if (geojson === null || typeof geojson !== 'object') {
		return null;
	}
	const candidate = geojson as { readonly type?: unknown; readonly coordinates?: unknown };
	// A type-only geometry would crash the summary and the preview, so require
	// coordinates to be present and non-empty.
	if (!Array.isArray(candidate.coordinates) || candidate.coordinates.length === 0) {
		return null;
	}
	return isSupportedGeometryType(candidate.type) ? (candidate as DrawGeometry) : null;
}

/**
 * The parts of `geometry`, in stored order, one entry for a single-part shape.
 *
 * The one place a multi shape is taken apart. The part list, the map draft and
 * Remove all read it, so "how many pieces is this" has a single answer.
 */
export function drawParts(geometry: DrawGeometry | null): readonly DrawPartGeometry[] {
	if (geometry === null) {
		return [];
	}
	switch (geometry.type) {
		case 'MultiPoint':
			return geometry.coordinates.map((coordinates) => ({ type: 'Point', coordinates }));
		case 'MultiLineString':
			return geometry.coordinates.map((coordinates) => ({ type: 'LineString', coordinates }));
		case 'MultiPolygon':
			return geometry.coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }));
		default:
			return [geometry];
	}
}

/**
 * The shape `parts` make: the part itself at one, the multi shape at two or more,
 * nothing at zero.
 *
 * Promote and demote in place, so a one-part multi shape never leaves here. The
 * domain demotes one on the way in as well, and the two agreeing is what lets a
 * removed part put the record back on its base shape without a second write.
 */
export function geometryFromParts(parts: readonly DrawPartGeometry[]): DrawGeometry | null {
	const first = parts[0];
	if (first === undefined) {
		return null;
	}
	if (parts.length === 1) {
		return first;
	}
	switch (first.type) {
		case 'Point':
			return {
				type: getMultipartGeometryType('Point'),
				coordinates: parts.flatMap((part) => (part.type === 'Point' ? [part.coordinates] : [])),
			};
		case 'LineString':
			return {
				type: getMultipartGeometryType('LineString'),
				coordinates: parts.flatMap((part) =>
					part.type === 'LineString' ? [part.coordinates] : [],
				),
			};
		default:
			return {
				type: getMultipartGeometryType('Polygon'),
				coordinates: parts.flatMap((part) => (part.type === 'Polygon' ? [part.coordinates] : [])),
			};
	}
}

/**
 * The holes cut out of `part`, in stored order, empty for a part that has none.
 *
 * A polygon's first ring is its outline and every ring after it is a hole, so
 * the hole rows and Remove both read this rather than slicing rings by hand.
 */
export function drawHoles(part: DrawPartGeometry): readonly DrawRing[] {
	return part.type === 'Polygon' ? part.coordinates.slice(1) : [];
}

/**
 * Why a hole as drawn cannot be cut out of the piece it was aimed at.
 *
 * `escapes` is a vertex outside the piece, or inside a hole the piece already
 * has. `swallows` is a hole that takes the whole piece, which leaves a polygon
 * covering no ground and a write the server answers 400.
 */
export type DrawHoleProblem = 'escapes' | 'swallows';

/**
 * Which piece a draw is aimed at, and how many pieces there are to tell it from.
 *
 * The toolbar names the piece only once there are several: at one piece there is
 * no row list the user could have read a number off, so the number is a term
 * they have not seen.
 */
export interface DrawPartTarget {
	/** The piece the draw is aimed at, numbered the way its row is. */
	readonly partNumber: number;
	readonly partCount: number;
}

/** The hole being drawn: the piece it belongs to, and what is wrong with it. */
export interface DrawHoleDraft extends DrawPartTarget {
	readonly problem: DrawHoleProblem | null;
}

/**
 * Why a part as continued cannot go back into the shape.
 *
 * `holesEscape` is a hole the part already had that the redrawn outline no
 * longer contains, which is a polygon PostGIS calls invalid.
 */
export type DrawContinueProblem = 'holesEscape';

/** The part being continued, and what is wrong with the outline as drawn. */
export interface DrawContinueDraft extends DrawPartTarget {
	readonly problem: DrawContinueProblem | null;
}

/**
 * Why a part as edited cannot go back into the shape.
 *
 * `holesEscape` is the continuation's, read from the other end: a hole the edit
 * has pushed outside the outline, or one that now takes the whole of it.
 * `tooFewVertices` is a ring left below the three distinct corners an area
 * needs, or a line below two, which Delete may do and Finish may not.
 * `tooFewCrossings` is a reshape sketch that never crosses the boundary twice,
 * so there is no stretch of it to replace. `doesNotDivide` is the split's
 * equivalent: a sketch that leaves one piece, or three. `cannotHoldParts` is a
 * split on a record kind with nowhere to put the second piece, which
 * `OWNED_GEOMETRY_POLICIES` decides. `coversNoGround` is an outline with corners
 * enough and no area between them, which a reshape can leave and three clicks in
 * one spot can too.
 */
export type DrawEditProblem =
	| DrawContinueProblem
	| 'tooFewVertices'
	| 'tooFewCrossings'
	| 'doesNotDivide'
	| 'cannotHoldParts'
	| 'coversNoGround';

/**
 * Which tool the open sketch belongs to.
 *
 * Reshape replaces the stretch of boundary between the sketch's two crossings;
 * split cuts the piece in two along it. Both trace a line over the same edit
 * draft, so the tool is what says which of the two the line means.
 */
export type DrawSketchTool = 'reshape' | 'split';

/** The line being sketched: which tool is drawing it, and how far along it is. */
export interface DrawSketchDraft {
	readonly tool: DrawSketchTool;
	readonly vertices: number;
}

/** The part being edited, what is wrong with it, and which vertex is picked. */
export interface DrawEditDraft extends DrawPartTarget {
	readonly problem: DrawEditProblem | null;
	/** The vertex Delete would remove, or null while none is picked. */
	readonly selected: DrawVertexRef | null;
	/**
	 * The line being sketched, or null while there is no sketch.
	 *
	 * One field rather than a flag, a tool and a count, because a sketch that has
	 * been started and has no vertices yet is a real state and three fields would
	 * have to agree on it.
	 */
	readonly sketch: DrawSketchDraft | null;
}

/**
 * The draw controller surface the form panel and the on-map toolbar both drive.
 * `start` is wired to the form's "Draw geometry" button; `finish`/`cancel`/`undo`
 * live on the floating map toolbar so the user exits draw mode from the map.
 */
export interface MapDrawController {
	readonly isDrawing: boolean;
	/** The draw in progress appends a part rather than replacing the shape. */
	readonly isAddingPart: boolean;
	readonly isRequestingPoint: boolean;
	readonly drawType: DrawGeometryType | null;
	readonly vertexCount: number;
	readonly canFinish: boolean;
	/**
	 * Whether Undo has anything left to pop.
	 *
	 * Not `vertexCount > 0`: a continuation opens with the piece's own vertices
	 * already placed, and Undo stops there rather than eating into them.
	 */
	readonly canUndo: boolean;
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
	readonly moveVertex: (vertex: DrawVertexRef, position: DrawPosition) => void;
	/**
	 * Put `position` on the edge that starts at `edge`, between its two ends
	 * rather than at the end of the ring, and pick the new vertex.
	 */
	readonly insertVertex: (edge: DrawVertexRef, position: DrawPosition) => void;
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

const SOURCE_ID = 'habitat-draw';

// Amber draft styling, deliberately distinct from the green reference habitats
// (vector tiles) and the blue detail overlay, so "the new/edited site" reads as
// its own active layer at a glance.
//
// These are the shared selection colours, not a private amber: the thing being
// drawn *is* the selected spatial context, and it has to match the selection
// halo the tile layers paint so the two never disagree on screen.
const draft = {
	fill: mapInteraction.selected,
	outline: mapInteraction.selectedStroke,
	line: mapInteraction.selected,
	vertex: mapInteraction.selected,
	vertexStroke: '#ffffff',
	point: mapInteraction.selected,
	pointStroke: '#ffffff',
	refused: mapInteraction.refused,
	refusedStroke: mapInteraction.refusedStroke,
} as const;

const isPolygon: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const isLine: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const isVertex: ExpressionSpecification = ['==', ['get', 'role'], 'vertex'];
const isPoint: ExpressionSpecification = ['==', ['get', 'role'], 'point'];

/**
 * Which part the pointer is over, picked out by weight rather than by a second
 * colour. A part is not a different kind of thing from the shape it belongs to,
 * so hovering a row thickens and fills it instead of recolouring it.
 */
function whenHighlighted(highlighted: number, rest: number): ExpressionSpecification {
	return ['case', ['boolean', ['get', 'highlighted'], false], highlighted, rest];
}

/**
 * The colour a draft paints in, red while the control would refuse it.
 *
 * Refusal is the one state that does get its own colour rather than more weight:
 * a hole that has wandered outside its piece is not a piece of the shape being
 * picked out, it is a shape that cannot be saved.
 */
function whenRefused(refused: string, rest: string): ExpressionSpecification {
	return ['case', ['boolean', ['get', 'refused'], false], refused, rest];
}

function drawLayers(): (
	| FillLayerSpecification
	| LineLayerSpecification
	| CircleLayerSpecification
)[] {
	return [
		{
			id: `${SOURCE_ID}-fill`,
			type: 'fill',
			source: SOURCE_ID,
			filter: isPolygon,
			paint: {
				'fill-color': whenRefused(draft.refused, draft.fill),
				'fill-opacity': whenHighlighted(0.42, 0.18),
			},
		},
		{
			id: `${SOURCE_ID}-outline`,
			type: 'line',
			source: SOURCE_ID,
			filter: isPolygon,
			layout: { 'line-join': 'round' },
			paint: {
				'line-color': whenRefused(draft.refusedStroke, draft.outline),
				'line-width': whenHighlighted(4.5, 2.5),
			},
		},
		{
			id: `${SOURCE_ID}-line`,
			type: 'line',
			source: SOURCE_ID,
			filter: isLine,
			layout: { 'line-join': 'round', 'line-cap': 'round' },
			paint: {
				'line-color': whenRefused(draft.refused, draft.line),
				'line-width': whenHighlighted(5, 3),
				'line-dasharray': [2, 1],
			},
		},
		{
			id: `${SOURCE_ID}-vertex`,
			type: 'circle',
			source: SOURCE_ID,
			filter: isVertex,
			paint: {
				'circle-color': whenRefused(draft.refused, draft.vertex),
				// Weight, not a second colour, so the vertex an edit has picked reads
				// the way a highlighted piece does. Refusal is the only state that
				// gets a colour of its own.
				'circle-radius': whenHighlighted(7.5, 5),
				'circle-stroke-color': draft.vertexStroke,
				'circle-stroke-width': 2,
			},
		},
		{
			id: `${SOURCE_ID}-point`,
			type: 'circle',
			source: SOURCE_ID,
			filter: isPoint,
			paint: {
				'circle-color': draft.point,
				'circle-radius': whenHighlighted(11, 8),
				'circle-stroke-color': draft.pointStroke,
				'circle-stroke-width': 3,
			},
		},
	];
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * What a finished draw does with the parts already committed. `replace` takes
 * every one of them, which is what "Redraw geometry" means at any part count;
 * `part` appends; `hole` cuts a ring out of the one part it names; `continue`
 * puts back the one part it names, redrawn from the vertices it already had;
 * `edit` puts back the one part it names, rings and all, as the edit left it.
 */
type DrawTarget =
	| { readonly kind: 'replace' }
	| { readonly kind: 'part' }
	| { readonly kind: 'hole'; readonly partIndex: number }
	| {
			readonly kind: 'continue';
			readonly partIndex: number;
			/** How many vertices the part arrived with, which is where Undo stops. */
			readonly seeded: number;
	  }
	| { readonly kind: 'edit'; readonly partIndex: number };

type DrawMode = {
	readonly kind: 'draw';
	readonly type: DrawGeometryType;
	readonly target: DrawTarget;
};

/**
 * A committed part open for editing.
 *
 * Its own mode rather than another {@link DrawTarget}, because a draw collects
 * one flat list of vertices and an edit holds every ring of the part at once.
 * Opening it, painting it and committing it are separate from the gestures that
 * change it, which is what lets reshape and split preview into the same draft
 * the three vertex gestures write to.
 */
type EditMode = {
	readonly kind: 'edit';
	readonly type: DrawGeometryType;
	readonly partIndex: number;
	/** Ring 0 is the outline; the rest are holes. Closing positions are dropped. */
	readonly rings: readonly DrawRing[];
	/**
	 * The rings before each gesture, oldest first.
	 *
	 * Undo's floor is the part as it was opened, the way a continuation's floor is
	 * the vertices it opened with: an edit must not eat into the piece the user
	 * asked to edit.
	 */
	readonly history: readonly (readonly DrawRing[])[];
	readonly selected: DrawVertexRef | null;
	/**
	 * The line being sketched, or null while the edit is not sketching one.
	 *
	 * Its own list rather than another ring, because it is not part of the shape:
	 * it previews into the rings and is gone the moment it lands. Empty is a
	 * sketch that has been started and has no vertices yet, which is not the same
	 * as no sketch at all.
	 */
	readonly sketch: DrawSketch | null;
	/**
	 * Whether the record kind can store the second piece a split leaves, read off
	 * `OWNED_GEOMETRY_POLICIES` when the part was opened.
	 *
	 * Carried on the mode rather than looked up where it is needed, so the paint,
	 * the problem and Finish read one answer and none of them has to be handed the
	 * record kind.
	 */
	readonly allowsParts: boolean;
};

/** The line one of the two sketch tools is tracing, and which tool that is. */
type DrawSketch = {
	readonly tool: DrawSketchTool;
	readonly positions: readonly DrawPosition[];
};

type Mode =
	| { readonly kind: 'idle' }
	| DrawMode
	| EditMode
	| {
			readonly kind: 'point';
			readonly resolve: (point: DrawGeometry & { readonly type: 'Point' }) => void;
			readonly reject: (error: Error) => void;
	  };

/** A vertex the pointer has hold of, drawn where the cursor is until it lands. */
interface DrawDrag {
	readonly vertex: DrawVertexRef;
	readonly position: DrawPosition;
}

/**
 * Binds a draft-geometry source + layers to a live map and runs a small draw
 * state machine over map clicks. Renders the committed `value` part by part, and
 * a live preview (placed vertices + a rubber-band segment to the cursor) while
 * drawing. Point finishes on the first click; line/polygon collect vertices
 * until the caller finishes from the map toolbar (or double-click / Enter).
 *
 * A draw either replaces the whole shape or adds one part to it, and the parts
 * already committed stay on the map through an add so the user draws against
 * them. Undo pops inside the part being drawn and stops at zero vertices, so
 * nothing it does can reopen a part that is already finished.
 */
export function useMapDraw({
	map,
	isLoaded,
	value,
	onChange,
	geometryKind,
}: {
	readonly map: MapboxMap | null;
	readonly isLoaded: boolean;
	readonly value: DrawGeometry | null;
	readonly onChange: (value: DrawGeometry | null) => void;
	/**
	 * The record kind whose geometry this draws, which is what says whether a
	 * split has anywhere to put its second piece. Omitted where the caller drives
	 * the control for a single point and never opens a part, as the address form
	 * does; a split refuses there.
	 */
	readonly geometryKind?: OwnedGeometryKind;
}): MapDrawController {
	const [mode, setMode] = useState<Mode>({ kind: 'idle' });
	const [vertices, setVertices] = useState<readonly DrawPosition[]>([]);

	// Frequently-changing render inputs live in refs so the rubber band can be
	// repainted on mousemove without a React re-render per frame.
	const cursorRef = useRef<DrawPosition | null>(null);
	const modeRef = useRef(mode);
	modeRef.current = mode;
	const verticesRef = useRef(vertices);
	verticesRef.current = vertices;
	const valueRef = useRef(value);
	valueRef.current = value;
	const onChangeRef = useRef(onChange);
	onChangeRef.current = onChange;

	// The vertex the pointer has hold of rides a ref rather than state, the way
	// the rubber band does: a drag repaints every frame and lands as one change.
	const dragRef = useRef<DrawDrag | null>(null);

	const {
		applyParts,
		continuePart,
		editPart,
		highlightedPart,
		highlightedRef,
		highlightPart,
		removeHole,
		removePart,
		startHole,
		startPart,
		zoomToPart,
	} = useDrawPartActions({
		map,
		geometryKind,
		cursorRef,
		dragRef,
		modeRef,
		valueRef,
		onChangeRef,
		setMode,
		setVertices,
	});

	const { holeDraft, continuedPart, editedPart } = useDrawDrafts(mode, value, vertices);

	const repaint = useCallback(() => {
		if (!isMapLive(map)) {
			return;
		}
		const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
		source?.setData(
			buildFeatures({
				committed: valueRef.current,
				mode: modeRef.current,
				vertices: verticesRef.current,
				cursor: cursorRef.current,
				drag: dragRef.current,
				highlighted: highlightedRef.current,
			}),
		);
	}, [map, highlightedRef]);

	// What the draft source holds after a real state change — a new committed
	// value, another vertex, a mode switch. The cursor is deliberately not a
	// dependency: it moves every frame and rides `repaint` instead, so a
	// mousemove repaints the rubber band without re-rendering anything.
	const features = useMemo(
		() =>
			buildFeatures({
				committed: value,
				mode,
				vertices,
				cursor: cursorRef.current,
				drag: dragRef.current,
				highlighted: highlightedPart,
			}),
		[value, mode, vertices, highlightedPart],
	);

	// The source lifecycle — add, re-add on restyle, setData for updates, guarded
	// teardown — is {@link useGeoJsonSource}'s. `onEnsure` repaints from the refs
	// so a basemap switch mid-draw brings back the shape as it stands now, cursor
	// included, rather than as of the last render.
	useGeoJsonSource({
		map,
		isLoaded,
		sourceId: SOURCE_ID,
		data: features,
		layers: drawLayers,
		onEnsure: repaint,
	});

	const finishRef = useRef<() => void>(() => {});

	useDrawMapEvents({
		map,
		isLoaded,
		mode,
		modeRef,
		cursorRef,
		dragRef,
		repaint,
		applyParts,
		finishRef,
		setMode,
		setVertices,
	});

	const {
		selectVertex,
		moveVertex,
		insertVertex,
		deleteVertex,
		startReshape,
		startSplit,
		sketchVertex,
	} = useDrawVertexActions(setMode);

	const { start, cancel, commit, undo, finish, requestPoint } = useDrawSession({
		map,
		applyParts,
		highlightPart,
		cursorRef,
		dragRef,
		modeRef,
		valueRef,
		verticesRef,
		onChangeRef,
		finishRef,
		setMode,
		setVertices,
	});

	useDrawEditEvents({
		map,
		isLoaded,
		isEditing: mode.kind === 'edit',
		modeRef,
		cursorRef,
		dragRef,
		repaint,
		moveVertex,
		insertVertex,
		deleteVertex,
		selectVertex,
		sketchVertex,
	});

	const progress = draftProgress(mode, value, vertices);

	return {
		isDrawing: mode.kind === 'draw' || mode.kind === 'edit',
		isAddingPart: mode.kind === 'draw' && mode.target.kind === 'part',
		isRequestingPoint: mode.kind === 'point',
		...progress,
		start,
		startPart,
		startHole,
		continuePart,
		continuedPart,
		editPart,
		editedPart,
		moveVertex,
		insertVertex,
		deleteVertex,
		selectVertex,
		startReshape,
		startSplit,
		removePart,
		removeHole,
		holeDraft,
		highlightPart,
		zoomToPart,
		finish,
		cancel,
		undo,
		commit,
		requestPoint,
	};
}

/**
 * Ease the map to frame `geometry`.
 *
 * A single position has no extent to fit, so it eases to centre instead and
 * keeps the zoom it is already at when that is closer in than 15.
 */
export function fitMapToGeometry(map: MapboxMap, geometry: GeoJsonGeometry): void {
	const bounds = boundsFromGeoJson(geometry);
	if (bounds === null) {
		return;
	}
	const hasArea = bounds.west !== bounds.east || bounds.south !== bounds.north;
	if (hasArea) {
		map.fitBounds(
			[
				[bounds.west, bounds.south],
				[bounds.east, bounds.north],
			],
			{ padding: 80, maxZoom: 17, duration: 600 },
		);
		return;
	}
	map.easeTo({ center: [bounds.west, bounds.south], zoom: Math.max(map.getZoom(), 15) });
}

/**
 * What the toolbar and the map both have to know about the draw in progress:
 * the hole being cut, the part being continued, and the part being edited.
 *
 * Recomputed from the committed parts and the vertices placed so far, so the
 * button, the instruction line and the paint on the map read one answer.
 */
function useDrawDrafts(
	mode: Mode,
	value: DrawGeometry | null,
	vertices: readonly DrawPosition[],
): {
	readonly holeDraft: DrawHoleDraft | null;
	readonly continuedPart: DrawContinueDraft | null;
	readonly editedPart: DrawEditDraft | null;
} {
	const holeDraft = useMemo(() => holeDraftOf(mode, value, vertices), [mode, value, vertices]);
	const continuedPart = useMemo(
		() => continuedPartOf(mode, value, vertices),
		[mode, value, vertices],
	);
	const editedPart = useMemo(() => editDraftOf(mode, value), [mode, value]);
	return { holeDraft, continuedPart, editedPart };
}

/** `vertices` with its last one dropped, unless that would go below `floor`. */
function poppedTo(vertices: readonly DrawPosition[], floor: number): readonly DrawPosition[] {
	return vertices.length <= floor ? vertices : vertices.slice(0, -1);
}

/**
 * The five buttons that open, close and take back a draw, and the point request
 * the address subform makes.
 *
 * Every one of them ends the same way, by putting the control somewhere new and
 * leaving nothing of the last draw behind, which is why they sit together and
 * share one {@link clear}. What a finished draw does with the committed parts is
 * `applyPart`'s and stays there.
 */
function useDrawSession({
	map,
	applyParts,
	highlightPart,
	cursorRef,
	dragRef,
	modeRef,
	valueRef,
	verticesRef,
	onChangeRef,
	finishRef,
	setMode,
	setVertices,
}: {
	readonly map: MapboxMap | null;
	readonly applyParts: (target: DrawTarget, parts: readonly DrawPartGeometry[]) => void;
	readonly highlightPart: (index: number | null) => void;
	readonly cursorRef: { current: DrawPosition | null };
	readonly dragRef: { current: DrawDrag | null };
	readonly modeRef: { current: Mode };
	readonly valueRef: { current: DrawGeometry | null };
	readonly verticesRef: { current: readonly DrawPosition[] };
	readonly onChangeRef: { current: (value: DrawGeometry | null) => void };
	readonly finishRef: { current: () => void };
	readonly setMode: Dispatch<SetStateAction<Mode>>;
	readonly setVertices: Dispatch<SetStateAction<readonly DrawPosition[]>>;
}): Pick<MapDrawController, 'start' | 'cancel' | 'commit' | 'undo' | 'finish' | 'requestPoint'> {
	// Nothing of the last draw survives a mode change: a pending point request is
	// told it was superseded, and the cursor, the grabbed vertex and the placed
	// vertices all go.
	const clear = useCallback(() => {
		rejectPending(modeRef.current);
		cursorRef.current = null;
		dragRef.current = null;
		setVertices([]);
	}, [cursorRef, dragRef, modeRef, setVertices]);

	const start = useCallback(
		(type: DrawGeometryType) => {
			// Starting a fresh draw clears every committed part, at any part count, so
			// the map shows exactly what the in-progress shape will become.
			clear();
			highlightPart(null);
			onChangeRef.current(null);
			setMode({ kind: 'draw', type, target: { kind: 'replace' } });
		},
		[clear, highlightPart, onChangeRef, setMode],
	);

	const cancel = useCallback(() => {
		clear();
		setMode({ kind: 'idle' });
	}, [clear, setMode]);

	const commit = useCallback(
		(geometry: DrawGeometry | null) => {
			clear();
			onChangeRef.current(geometry);
			setMode({ kind: 'idle' });
		},
		[clear, onChangeRef, setMode],
	);

	const undo = useCallback(() => {
		if (modeRef.current.kind === 'edit') {
			setMode(undoneEdit);
			return;
		}
		setVertices((previous) => poppedTo(previous, vertexFloor(modeRef.current)));
	}, [modeRef, setMode, setVertices]);

	// An open reshape is what Finish lands, and the Finish after that commits the
	// part. Two presses rather than one because the reshaped outline is still a
	// draft the other gestures can work on, the way a moved vertex is. A split
	// takes one press: two pieces are not a draft this mode can hold.
	const finish = useCallback(() => {
		const current = modeRef.current;
		if (current.kind === 'edit' && current.sketch?.tool === 'reshape') {
			cursorRef.current = null;
			setMode(landedSketch);
			return;
		}
		const finished = finishedParts(current, valueRef.current, verticesRef.current);
		if (finished !== null) {
			applyParts(finished.target, finished.parts);
		}
	}, [applyParts, cursorRef, modeRef, setMode, valueRef, verticesRef]);
	finishRef.current = finish;

	const requestPoint = useCallback(
		(_prompt?: string) =>
			new Promise<DrawGeometry & { readonly type: 'Point' }>((resolve, reject) => {
				if (!isMapLive(map)) {
					reject(new Error('The map is not ready yet.'));
					return;
				}
				clear();
				setMode({ kind: 'point', resolve, reject });
			}),
		[clear, map, setMode],
	);

	return { start, cancel, commit, undo, finish, requestPoint };
}

/**
 * What Finish commits and where it goes, or null while the draft is not one the
 * record can hold.
 *
 * A list rather than one part because a split leaves two, which go in at the
 * index the one they replace came from. Every other path leaves exactly one.
 *
 * A point draw is left out because it commits on its own first click, and there
 * is no Finish button under it to press.
 */
function finishedParts(
	mode: Mode,
	committed: DrawGeometry | null,
	vertices: readonly DrawPosition[],
): { readonly target: DrawTarget; readonly parts: readonly DrawPartGeometry[] } | null {
	if (mode.kind === 'edit') {
		const parts = editedPartsOf(mode);
		return parts === null ? null : { target: { kind: 'edit', partIndex: mode.partIndex }, parts };
	}
	if (mode.kind !== 'draw' || mode.type === 'Point') {
		return null;
	}
	const part = draftPart(mode, committed, dedupeTrailing(vertices));
	return part === null ? null : { target: mode.target, parts: [part] };
}

/**
 * The gestures an open edit answers to: the three that move a corner, the pick
 * Delete reads, and the two sketch tools.
 *
 * Its own hook because all of them write the edit mode and nothing else in the
 * controller does. The ones that change the rings land through `changeRings`,
 * so a gesture costs exactly one Undo step and none of them can forget to
 * record one.
 */
function useDrawVertexActions(setMode: Dispatch<SetStateAction<Mode>>) {
	const selectVertex = useCallback(
		(vertex: DrawVertexRef | null) => {
			setMode((previous) =>
				previous.kind === 'edit' ? { ...previous, selected: vertex } : previous,
			);
		},
		[setMode],
	);

	const changeRings = useCallback(
		(
			change: (rings: readonly DrawRing[]) => readonly DrawRing[] | null,
			selected: (rings: readonly DrawRing[]) => DrawVertexRef | null,
		) => {
			setMode((previous) => {
				if (previous.kind !== 'edit') {
					return previous;
				}
				const rings = change(previous.rings);
				if (rings === null) {
					return previous;
				}
				return {
					...previous,
					rings,
					history: [...previous.history, previous.rings],
					selected: selected(rings),
				};
			});
		},
		[setMode],
	);

	const moveVertex = useCallback(
		(vertex: DrawVertexRef, position: DrawPosition) => {
			changeRings(
				(rings) => moveRingVertex(rings, vertex, position),
				() => vertex,
			);
		},
		[changeRings],
	);

	// The new vertex is picked, so clicking an edge and pressing Delete undoes
	// itself rather than removing whichever corner happened to be picked before.
	const insertVertex = useCallback(
		(edge: DrawVertexRef, position: DrawPosition) => {
			changeRings(
				(rings) => insertRingVertex(rings, edge, position),
				() => ({ ring: edge.ring, vertex: edge.vertex + 1 }),
			);
		},
		[changeRings],
	);

	// Nothing stays picked: every index after the one dropped has shifted, so a
	// pick kept here would name a different corner than the one on screen did.
	const deleteVertex = useCallback(
		(vertex: DrawVertexRef) => {
			changeRings(
				(rings) => removeRingVertex(rings, vertex),
				() => null,
			);
		},
		[changeRings],
	);

	// A point has one corner and no boundary a line could cross, so there is
	// nothing here to sketch across. The pick goes because the vertex gestures are
	// off for as long as the sketch is open.
	const openSketch = useCallback(
		(tool: DrawSketchTool) => {
			setMode((previous) =>
				previous.kind === 'edit' && previous.type !== 'Point'
					? { ...previous, selected: null, sketch: { tool, positions: [] } }
					: previous,
			);
		},
		[setMode],
	);
	const startReshape = useCallback(() => openSketch('reshape'), [openSketch]);
	// Not refused here even where the record kind cannot hold two pieces. The
	// draft names that refusal and the toolbar says it, which is the only place
	// the user would find out why the tool did nothing.
	const startSplit = useCallback(() => openSketch('split'), [openSketch]);

	// Not through `changeRings`: a sketch vertex changes no ring, and Undo pops it
	// one at a time rather than taking the whole sketch back at once.
	const sketchVertex = useCallback(
		(position: DrawPosition) => {
			setMode((previous) =>
				previous.kind === 'edit' && previous.sketch !== null
					? {
							...previous,
							sketch: {
								...previous.sketch,
								positions: [...previous.sketch.positions, position],
							},
						}
					: previous,
			);
		},
		[setMode],
	);

	return {
		selectVertex,
		moveVertex,
		insertVertex,
		deleteVertex,
		startReshape,
		startSplit,
		sketchVertex,
	};
}

/**
 * How far along the draw in progress is: which tool it is on, how many vertices
 * it holds, and whether Finish and Undo have anything to do.
 *
 * One place rather than four expressions beside the returned object, because a
 * draw and an edit answer each of them differently and the four had to agree on
 * which of the two they were reading.
 */
function draftProgress(
	mode: Mode,
	committed: DrawGeometry | null,
	vertices: readonly DrawPosition[],
): Pick<MapDrawController, 'drawType' | 'vertexCount' | 'canFinish' | 'canUndo'> {
	if (mode.kind === 'edit') {
		return {
			drawType: mode.type,
			vertexCount: countRingVertices(mode.rings),
			// The same covers-ground rule a draw runs, read off the rings as edited,
			// the open sketch folded in.
			canFinish: editedPartsOf(mode) !== null,
			// A sketch is always something to take back, even before it has a vertex:
			// Undo is what closes an empty one.
			canUndo: mode.sketch !== null || mode.history.length > 0,
		};
	}
	return {
		drawType: mode.kind === 'draw' ? mode.type : null,
		vertexCount: vertices.length,
		canFinish:
			mode.kind === 'draw' && draftPart(mode, committed, dedupeTrailing(vertices)) !== null,
		canUndo: vertices.length > vertexFloor(mode),
	};
}

/**
 * Everything that acts on the committed parts: adding one, dropping one, and
 * picking one out on the map.
 *
 * A hook of its own because the four of them share one piece of state, the
 * highlighted index, and because the controller they hang off is already the
 * widest thing in this file.
 */
function useDrawPartActions({
	map,
	geometryKind,
	cursorRef,
	dragRef,
	modeRef,
	valueRef,
	onChangeRef,
	setMode,
	setVertices,
}: {
	readonly map: MapboxMap | null;
	readonly geometryKind: OwnedGeometryKind | undefined;
	readonly cursorRef: { current: DrawPosition | null };
	readonly dragRef: { current: DrawDrag | null };
	readonly modeRef: { current: Mode };
	readonly valueRef: { current: DrawGeometry | null };
	readonly onChangeRef: { current: (value: DrawGeometry | null) => void };
	readonly setMode: (next: Mode) => void;
	readonly setVertices: (next: readonly DrawPosition[]) => void;
}) {
	const [highlightedPart, setHighlightedPart] = useState<number | null>(null);
	const highlightedRef = useRef(highlightedPart);
	highlightedRef.current = highlightedPart;

	// The one place a finished draw lands. `replace` throws the committed parts
	// away, `part` appends to them, `hole` puts back the one part it names with
	// its new ring, and the shape that comes out is whatever `geometryFromParts`
	// says the count makes it.
	//
	// A finish that leaves the shape where it was reports nothing. Continuing a
	// piece and pressing Finish without placing a corner used to publish the same
	// geometry back, and the form reads any publication as a redraw. On a habitat
	// a redraw names `updateHabitatLocation`, which sits at the manager floor, so
	// a collector's details-only save was refused for a shape nobody moved (#472).
	// The compare is over the geometry about to go out, so a ring closed on Finish
	// matches the ring it was seeded from, and it runs once per Finish rather than
	// on any render.
	const applyParts = useCallback(
		(target: DrawTarget, parts: readonly DrawPartGeometry[]) => {
			const existing = drawParts(valueRef.current);
			const next = geometryFromParts(withParts(existing, target, parts));
			const unchanged = sameDrawGeometry(next, valueRef.current);
			cursorRef.current = null;
			dragRef.current = null;
			setVertices([]);
			setMode({ kind: 'idle' });
			// The draw still ends: the mode, the cursor and the vertices go either
			// way, and only the change notification is withheld.
			if (!unchanged) {
				onChangeRef.current(next);
			}
		},
		[cursorRef, dragRef, valueRef, onChangeRef, setMode, setVertices],
	);

	// The base shape comes off the committed parts rather than off the toggle:
	// they are the thing being added to, and a toggle change has already cleared
	// them.
	const startPart = useCallback(() => {
		const base = drawParts(valueRef.current)[0]?.type;
		if (base === undefined) {
			return;
		}
		rejectPending(modeRef.current);
		cursorRef.current = null;
		setVertices([]);
		setHighlightedPart(null);
		setMode({ kind: 'draw', type: base, target: { kind: 'part' } });
	}, [cursorRef, modeRef, valueRef, setMode, setVertices]);

	// Refused here rather than left to whichever button happens to be hidden. A
	// part that is not an area has no inside, and the containment check would read
	// its coordinate pair as a ring and call every vertex of the hole escaped.
	const startHole = useCallback(
		(index: number) => {
			const part = drawParts(valueRef.current)[index];
			if (part?.type !== 'Polygon') {
				return;
			}
			rejectPending(modeRef.current);
			cursorRef.current = null;
			setVertices([]);
			setHighlightedPart(null);
			setMode({ kind: 'draw', type: 'Polygon', target: { kind: 'hole', partIndex: index } });
		},
		[cursorRef, modeRef, valueRef, setMode, setVertices],
	);

	// The part stays committed through the continuation, so Cancel and Escape put
	// it back with nothing to restore: the draw is abandoned and the part is still
	// where it was. What is committed is what the map draws, so the draft takes
	// over drawing this one part while the mode is on it.
	const continuePart = useCallback(
		(index: number) => {
			const part = drawParts(valueRef.current)[index];
			const seeded = part === undefined ? null : continuedVertices(part);
			if (part === undefined || seeded === null) {
				return;
			}
			rejectPending(modeRef.current);
			cursorRef.current = null;
			setVertices(seeded);
			setHighlightedPart(null);
			setMode({
				kind: 'draw',
				type: part.type,
				target: { kind: 'continue', partIndex: index, seeded: seeded.length },
			});
		},
		[cursorRef, modeRef, valueRef, setMode, setVertices],
	);

	// Every ring the part has, not just its outline: a hole is edited with the same
	// three gestures as the shell, so all of them are seeded together and go back
	// together. The part stays committed through the edit, so Cancel and Escape put
	// it back with nothing to restore, holes included.
	const editPart = useCallback(
		(index: number) => {
			const part = drawParts(valueRef.current)[index];
			if (part === undefined) {
				return;
			}
			rejectPending(modeRef.current);
			cursorRef.current = null;
			dragRef.current = null;
			setVertices([]);
			setHighlightedPart(null);
			setMode({
				kind: 'edit',
				type: part.type,
				partIndex: index,
				rings: ringsOfPart(part),
				history: [],
				selected: null,
				sketch: null,
				allowsParts:
					geometryKind !== undefined && ownedGeometryAllowsParts(geometryKind, part.type),
			});
		},
		[cursorRef, dragRef, geometryKind, modeRef, valueRef, setMode, setVertices],
	);

	const removePart = useCallback(
		(index: number) => {
			setHighlightedPart(null);
			onChangeRef.current(
				geometryFromParts(drawParts(valueRef.current).filter((_, at) => at !== index)),
			);
		},
		[valueRef, onChangeRef],
	);

	// `holeIndex` counts holes, not rings, so nothing outside this file has to
	// know that ring zero is the outline.
	const removeHole = useCallback(
		(partIndex: number, holeIndex: number) => {
			const parts = drawParts(valueRef.current);
			const part = parts[partIndex];
			if (part?.type !== 'Polygon' || drawHoles(part)[holeIndex] === undefined) {
				return;
			}
			const rings = part.coordinates.filter((_, at) => at !== holeIndex + 1);
			onChangeRef.current(
				geometryFromParts(
					parts.map((at, index) =>
						index === partIndex ? { type: 'Polygon', coordinates: rings } : at,
					),
				),
			);
		},
		[valueRef, onChangeRef],
	);

	const zoomToPart = useCallback(
		(index: number) => {
			const part = drawParts(valueRef.current)[index];
			if (part === undefined || !isMapLive(map)) {
				return;
			}
			fitMapToGeometry(map, part);
		},
		[map, valueRef],
	);

	return {
		applyParts,
		continuePart,
		editPart,
		highlightedPart,
		highlightedRef,
		highlightPart: setHighlightedPart,
		removeHole,
		removePart,
		startHole,
		startPart,
		zoomToPart,
	};
}

/**
 * `parts` with a finished draw folded into them, which is the whole list for a
 * replace, one more entry for an add, and one entry swapped for a hole, a
 * continuation or an edit.
 *
 * `finished` is a list because a split hands back two, and both go in where the
 * one they replace was, so the pieces of a shape stay in the order they sit on
 * the map. Everything else hands back exactly one.
 */
function withParts(
	parts: readonly DrawPartGeometry[],
	target: DrawTarget,
	finished: readonly DrawPartGeometry[],
): readonly DrawPartGeometry[] {
	if (target.kind === 'replace') {
		return finished;
	}
	if (target.kind === 'part') {
		return [...parts, ...finished];
	}
	return parts.flatMap((at, index) => (index === target.partIndex ? finished : [at]));
}

/**
 * Whether two drawn shapes are the same shape.
 *
 * The type, then the coordinates position by position, at whatever depth the
 * shape nests them: a Point holds one pair, a MultiPolygon holds four levels of
 * array above the same pairs. One recursion rather than a case per type, because
 * every shape a draw can hold is arrays of numbers under `coordinates`.
 *
 * Exact numbers, not a tolerance. Both sides come from the same stored ring
 * through the same helpers, so an untouched piece round-trips to the identical
 * values, and anything the user actually moved differs by a click's worth of
 * degrees rather than by rounding.
 */
function sameDrawGeometry(first: DrawGeometry | null, second: DrawGeometry | null): boolean {
	if (first === null || second === null) {
		return first === second;
	}
	return first.type === second.type && sameCoordinates(first.coordinates, second.coordinates);
}

/** {@link sameDrawGeometry}'s recursion over one `coordinates` tree. */
function sameCoordinates(first: unknown, second: unknown): boolean {
	if (!Array.isArray(first) || !Array.isArray(second)) {
		return first === second;
	}
	return (
		first.length === second.length &&
		first.every((entry, index) => sameCoordinates(entry, second[index]))
	);
}

/**
 * Where a continuation picks up: the part's own vertices, in order, with a
 * ring's repeated closing position dropped so the next click appends to the last
 * corner the user actually placed. `closeRing` puts it back on Finish.
 *
 * The drop is conditional because `closeRing` is: a ring adopted from a file or
 * a region is only closed if whoever wrote it closed it, and slicing one that is
 * not would lose a real corner.
 *
 * Null for a point, which is one position with no end to carry on from.
 */
function continuedVertices(part: DrawPartGeometry): readonly DrawPosition[] | null {
	return part.type === 'Point' ? null : (ringsOfPart(part)[0] ?? []);
}

/**
 * The rings of `part`, closing positions dropped, which is what an edit draft
 * holds and where a continuation picks up.
 *
 * Ring 0 is the outline of an area, the whole of a line, or the single position
 * of a point. A line is left exactly as stored: it has no closing position, and
 * one whose ends happen to meet would lose a real corner to the drop.
 */
function ringsOfPart(part: DrawPartGeometry): readonly DrawRing[] {
	if (part.type === 'Point') {
		return [[part.coordinates]];
	}
	if (part.type === 'LineString') {
		return [part.coordinates];
	}
	return part.coordinates.map(unclosedRing);
}

/** How far Undo pops back, which is the vertices a continuation opened with. */
function vertexFloor(mode: Mode): number {
	return mode.kind === 'draw' && mode.target.kind === 'continue' ? mode.target.seeded : 0;
}

/**
 * The holes already cut into the part a continuation is redrawing.
 *
 * A continuation redraws the outline and nothing else, so the rings the user cut
 * earlier are not theirs to lose by adding one vertex to it.
 */
function continuedHoles(mode: DrawMode, committed: DrawGeometry | null): readonly DrawRing[] {
	if (mode.target.kind !== 'continue') {
		return [];
	}
	const part = drawParts(committed)[mode.target.partIndex];
	return part === undefined ? [] : drawHoles(part);
}

/** `part` with `holes` put back into it, which only an area can hold. */
function withHoles(part: DrawPartGeometry, holes: readonly DrawRing[]): DrawPartGeometry {
	return part.type === 'Polygon' && holes.length > 0
		? { type: 'Polygon', coordinates: [...part.coordinates, ...holes] }
		: part;
}

/**
 * Map and keyboard wiring, live only while a mode needs it.
 *
 * Its own hook because an idle map should carry no extra click, move or key
 * listener, and because the cursor and the double-click zoom it takes over have
 * to be handed back on every exit, including the one where the map has already
 * been removed.
 */
function useDrawMapEvents({
	map,
	isLoaded,
	mode,
	modeRef,
	cursorRef,
	dragRef,
	repaint,
	applyParts,
	finishRef,
	setMode,
	setVertices,
}: {
	readonly map: MapboxMap | null;
	readonly isLoaded: boolean;
	readonly mode: Mode;
	readonly modeRef: { current: Mode };
	readonly cursorRef: { current: DrawPosition | null };
	readonly dragRef: { current: DrawDrag | null };
	readonly repaint: () => void;
	readonly applyParts: (target: DrawTarget, parts: readonly DrawPartGeometry[]) => void;
	readonly finishRef: { current: () => void };
	readonly setMode: (next: Mode) => void;
	readonly setVertices: (
		next:
			| readonly DrawPosition[]
			| ((previous: readonly DrawPosition[]) => readonly DrawPosition[]),
	) => void;
}): void {
	// Whether this draft has already been handed the canvas. The effect re-runs
	// on every mode change and an edit changes mode on every drag, so focusing on
	// each run would take focus back off a field the user had moved to mid-draw.
	const tookFocusRef = useRef(false);

	useEffect(() => {
		if (!isMapLive(map) || !isLoaded || mode.kind === 'idle') {
			tookFocusRef.current = false;
			return;
		}
		const activeMap = map;
		const canvas = activeMap.getCanvas();
		const previousCursor = canvas.style.cursor;
		canvas.style.cursor = 'crosshair';
		const doubleClickZoomWasEnabled = activeMap.doubleClickZoom.isEnabled();
		activeMap.doubleClickZoom.disable();
		// The key half of this hook only answers to keys the map surface got, so
		// the surface has to hold focus from the moment a draft opens rather than
		// from the first click on it. Every opener is a button somewhere else on
		// the page, and Escape is what the point prompt tells the user to press.
		// The canvas is mapbox's own focus target: `tabindex="0"`, `role="region"`
		// and an aria-label, and the element its arrow-key panning already needs
		// focused.
		if (!tookFocusRef.current) {
			tookFocusRef.current = true;
			canvas.focus({ preventScroll: true });
		}

		function handleClick(event: MapMouseEvent) {
			const current = modeRef.current;
			const position: DrawPosition = [event.lngLat.lng, event.lngLat.lat];
			if (current.kind === 'point') {
				current.resolve({ type: 'Point', coordinates: position });
				setMode({ kind: 'idle' });
				return;
			}
			if (current.kind !== 'draw') {
				return;
			}
			// A point piece finishes on its first click, the way a first point does.
			if (current.type === 'Point') {
				applyParts(current.target, [{ type: 'Point', coordinates: position }]);
				return;
			}
			setVertices((previous) => [...previous, position]);
		}

		function handleMove(event: MapMouseEvent) {
			// An edit owns the cursor: {@link useDrawEditEvents} says whether a vertex
			// is under the pointer, and this would paint over the answer. Both
			// handlers are live at once and which runs last follows whichever effect
			// re-registered most recently, so the answer cannot be left to order.
			if (modeRef.current.kind === 'edit') {
				return;
			}
			canvas.style.cursor = 'crosshair';
			if (isRubberBanding(modeRef.current)) {
				cursorRef.current = [event.lngLat.lng, event.lngLat.lat];
				repaint();
			}
		}

		function handleDoubleClick(event: MapMouseEvent) {
			if (isRubberBanding(modeRef.current)) {
				event.preventDefault();
				finishRef.current();
			}
		}

		// The location panel sits beside the map and its controls stay live while a
		// draft is open, so an Enter meant for a description must not finish the
		// shape and an Escape meant to close a dropdown must not throw the draft
		// away. Both arms cover every mode this listener is registered for,
		// because a draw, a hole, a continuation, an edit and an open sketch all
		// reach Finish through the same `finishRef` and all cancel through the one
		// Escape arm.
		function handleKeyDown(event: KeyboardEvent) {
			if (
				(event.key !== 'Enter' && event.key !== 'Escape') ||
				!isAimedAtMap(activeMap, event.target)
			) {
				return;
			}
			if (event.key === 'Enter') {
				finishRef.current();
				return;
			}
			const current = modeRef.current;
			if (current.kind === 'point') {
				current.reject(new Error('Point selection cancelled.'));
			}
			cursorRef.current = null;
			dragRef.current = null;
			setVertices([]);
			setMode({ kind: 'idle' });
		}

		activeMap.on('click', handleClick);
		activeMap.on('mousemove', handleMove);
		activeMap.on('dblclick', handleDoubleClick);
		window.addEventListener('keydown', handleKeyDown);

		return () => {
			activeMap.off('click', handleClick);
			activeMap.off('mousemove', handleMove);
			activeMap.off('dblclick', handleDoubleClick);
			window.removeEventListener('keydown', handleKeyDown);
			try {
				canvas.style.cursor = previousCursor;
				if (doubleClickZoomWasEnabled) {
					activeMap.doubleClickZoom.enable();
				}
			} catch {
				// Map already torn down.
			}
		};
	}, [
		map,
		isLoaded,
		mode,
		modeRef,
		cursorRef,
		dragRef,
		repaint,
		applyParts,
		finishRef,
		setMode,
		setVertices,
	]);
}

/**
 * How far from the pointer a vertex or an edge still counts as under it, in
 * pixels. A 5px circle is a small thing to hit with a mouse and a smaller one
 * with a thumb.
 */
const HIT_TOLERANCE = 8;

const VERTEX_LAYER = `${SOURCE_ID}-vertex`;
/** The layers a part's own boundary draws on, which is where an edge is clicked. */
const EDGE_LAYERS = [`${SOURCE_ID}-outline`, `${SOURCE_ID}-line`];

/**
 * The pointer half of editing: grab, drag, drop, click an edge, Delete, and the
 * clicks that trace a reshape line.
 *
 * Its own hook, live only while a part is open for editing, because none of it
 * belongs on a map that is drawing or idle. What each gesture does to the rings
 * is the controller's; this only says which ring and which vertex was meant.
 *
 * An open sketch takes the pointer over completely. Every vertex gesture is off
 * while it is: a click is another sketch vertex, and there is nothing to grab or
 * delete until the sketch has landed.
 */
function useDrawEditEvents({
	map,
	isLoaded,
	isEditing,
	modeRef,
	cursorRef,
	dragRef,
	repaint,
	moveVertex,
	insertVertex,
	deleteVertex,
	selectVertex,
	sketchVertex,
}: {
	readonly map: MapboxMap | null;
	readonly isLoaded: boolean;
	readonly isEditing: boolean;
	readonly modeRef: { current: Mode };
	readonly cursorRef: { current: DrawPosition | null };
	readonly dragRef: { current: DrawDrag | null };
	readonly repaint: () => void;
	readonly moveVertex: (vertex: DrawVertexRef, position: DrawPosition) => void;
	readonly insertVertex: (edge: DrawVertexRef, position: DrawPosition) => void;
	readonly deleteVertex: (vertex: DrawVertexRef) => void;
	readonly selectVertex: (vertex: DrawVertexRef | null) => void;
	readonly sketchVertex: (position: DrawPosition) => void;
}): void {
	useEffect(() => {
		if (!isMapLive(map) || !isLoaded || !isEditing) {
			return;
		}
		const activeMap = map;
		const canvas = activeMap.getCanvas();

		function handleDown(event: MapMouseEvent) {
			const vertex = isSketching(modeRef.current) ? null : vertexUnder(activeMap, event);
			if (vertex === null) {
				return;
			}
			// Mapbox pans on a drag unless the gesture is claimed here, so the map
			// would slide out from under the vertex being moved.
			event.preventDefault();
			dragRef.current = { vertex, position: [event.lngLat.lng, event.lngLat.lat] };
			selectVertex(vertex);
		}

		// A drag repaints from the ref rather than through state, so the vertex
		// follows the cursor at frame rate and the move lands as one change.
		function handleMove(event: MapMouseEvent) {
			// The sketch trails the cursor the way a draw's rubber band does, and the
			// reshape it would make is repainted with it.
			if (isSketching(modeRef.current)) {
				cursorRef.current = [event.lngLat.lng, event.lngLat.lat];
				canvas.style.cursor = 'crosshair';
				repaint();
				return;
			}
			const drag = dragRef.current;
			if (drag !== null) {
				dragRef.current = { vertex: drag.vertex, position: [event.lngLat.lng, event.lngLat.lat] };
				canvas.style.cursor = 'grabbing';
				repaint();
				return;
			}
			canvas.style.cursor = vertexUnder(activeMap, event) === null ? 'crosshair' : 'move';
		}

		// On the window rather than the map, because a button released off the canvas
		// never reaches the map and would leave the vertex following the cursor with
		// nothing to drop it. The drag's own last position is where it lands: past
		// the canvas edge there is no longer a map coordinate to read.
		function handleUp() {
			const drag = dragRef.current;
			dragRef.current = null;
			const current = modeRef.current;
			if (drag === null || current.kind !== 'edit') {
				return;
			}
			// A click on a vertex is a mousedown and a mouseup in one spot. Landing it
			// as a move would cost an Undo step that took nothing back.
			const from = current.rings[drag.vertex.ring]?.[drag.vertex.vertex];
			if (from !== undefined && !samePosition(from, drag.position)) {
				moveVertex(drag.vertex, drag.position);
			}
			repaint();
		}

		function handleClick(event: MapMouseEvent) {
			if (isSketching(modeRef.current)) {
				sketchVertex([event.lngLat.lng, event.lngLat.lat]);
				return;
			}
			const vertex = vertexUnder(activeMap, event);
			if (vertex !== null) {
				selectVertex(vertex);
				return;
			}
			const current = modeRef.current;
			const position: DrawPosition = [event.lngLat.lng, event.lngLat.lat];
			// Only the boundary, not the fill: a click in the middle of an area is not
			// aimed at an edge, and inserting on the nearest one would be a guess.
			const edge =
				current.kind === 'edit' && isOverEdge(activeMap, event)
					? nearestRingEdge(current.rings, position, current.type === 'Polygon')
					: null;
			if (edge === null) {
				selectVertex(null);
				return;
			}
			insertVertex(edge, position);
		}

		// Backspace as well as Delete, because a laptop keyboard often has only the
		// one key. That is also why the surface guard is here and not optional: the
		// location panel sits beside the map, and a backspace meant for a
		// description would otherwise take a corner off the shape.
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key !== 'Delete' && event.key !== 'Backspace') {
				return;
			}
			const current = modeRef.current;
			if (
				current.kind !== 'edit' ||
				current.selected === null ||
				current.sketch !== null ||
				!isAimedAtMap(activeMap, event.target)
			) {
				return;
			}
			event.preventDefault();
			deleteVertex(current.selected);
		}

		activeMap.on('mousedown', handleDown);
		activeMap.on('mousemove', handleMove);
		activeMap.on('click', handleClick);
		window.addEventListener('mouseup', handleUp);
		window.addEventListener('keydown', handleKeyDown);

		return () => {
			activeMap.off('mousedown', handleDown);
			activeMap.off('mousemove', handleMove);
			activeMap.off('click', handleClick);
			window.removeEventListener('mouseup', handleUp);
			window.removeEventListener('keydown', handleKeyDown);
			dragRef.current = null;
		};
	}, [
		map,
		isLoaded,
		isEditing,
		modeRef,
		cursorRef,
		dragRef,
		repaint,
		moveVertex,
		insertVertex,
		deleteVertex,
		selectVertex,
		sketchVertex,
	]);
}

/** Whether a reshape line is open, which takes the pointer over completely. */
function isSketching(mode: Mode): boolean {
	return mode.kind === 'edit' && mode.sketch !== null;
}

/** The vertex under the pointer, read off the feature the map answers with. */
function vertexUnder(map: MapboxMap, event: MapMouseEvent): DrawVertexRef | null {
	const [feature] = map.queryRenderedFeatures(hitBox(event), { layers: [VERTEX_LAYER] });
	const ring = feature?.properties?.ring;
	const vertex = feature?.properties?.vertex;
	return typeof ring === 'number' && typeof vertex === 'number' ? { ring, vertex } : null;
}

/** Whether the pointer is on a boundary rather than inside or outside a shape. */
function isOverEdge(map: MapboxMap, event: MapMouseEvent): boolean {
	return map.queryRenderedFeatures(hitBox(event), { layers: EDGE_LAYERS }).length > 0;
}

function hitBox(event: MapMouseEvent): [PointLike, PointLike] {
	const { x, y } = event.point;
	return [
		[x - HIT_TOLERANCE, y - HIT_TOLERANCE],
		[x + HIT_TOLERANCE, y + HIT_TOLERANCE],
	];
}

/**
 * Whether the cursor is trailing a segment, which a line, an area and a reshape
 * sketch all do.
 *
 * It is also what double-click answers to, so a sketch completes the way a draw
 * does rather than needing a gesture of its own.
 */
function isRubberBanding(mode: Mode): boolean {
	if (mode.kind === 'edit') {
		return mode.sketch !== null;
	}
	return mode.kind === 'draw' && mode.type !== 'Point';
}

function rejectPending(mode: Mode): void {
	if (mode.kind === 'point') {
		mode.reject(new Error('A new map request replaced this one.'));
	}
}

/**
 * Every committed part, plus the part being drawn over the top of them.
 *
 * The committed parts stay on the map through an add and through a hole, so the
 * user places the new ring against what is already there. A replace has already
 * cleared them. A continuation and an edit are the two cases that hide a
 * committed part: the draft is that part, and drawing both would put a finished
 * outline under a changing one.
 */
function buildFeatures({
	committed,
	mode,
	vertices,
	cursor,
	drag,
	highlighted,
}: {
	readonly committed: DrawGeometry | null;
	readonly mode: Mode;
	readonly vertices: readonly DrawPosition[];
	readonly cursor: DrawPosition | null;
	readonly drag: DrawDrag | null;
	readonly highlighted: number | null;
}): GeoJSON.FeatureCollection {
	const features: GeoJSON.Feature[] = [];
	const drafted = draftedPartIndex(mode);
	drawParts(committed).forEach((part, index) => {
		if (index !== drafted) {
			features.push(...partFeatures(part, index === highlighted));
		}
	});

	if (mode.kind === 'draw') {
		features.push(...draftFeatures(mode, committed, vertices, cursor));
	}
	if (mode.kind === 'edit') {
		features.push(...editFeatures(mode, drag, cursor));
	}

	return features.length === 0 ? EMPTY : { type: 'FeatureCollection', features };
}

/** Which committed part the draft has taken over drawing, if any. */
function draftedPartIndex(mode: Mode): number | null {
	if (mode.kind === 'edit') {
		return mode.partIndex;
	}
	return mode.kind === 'draw' && mode.target.kind === 'continue' ? mode.target.partIndex : null;
}

/**
 * The part being edited: its rings as they stand, and every corner of every one
 * of them as a vertex to grab.
 *
 * A vertex carries the ring and the index it sits at, so the pointer hit-test
 * reads the target off the feature rather than searching the rings for the
 * nearest position. The vertex being dragged is drawn under the cursor before
 * the move lands, which is what makes the drag look like one.
 *
 * A sketch previews the same way: the pieces drawn are the ones the sketch would
 * leave, the cursor included, so the result is on the map before the sketch is
 * finished. A split draws both of them. The sketch itself is drawn over the top,
 * so what was traced and what it did are both visible.
 */
function editFeatures(
	mode: EditMode,
	drag: DrawDrag | null,
	cursor: DrawPosition | null,
): GeoJSON.Feature[] {
	const dragged =
		drag === null
			? mode.rings
			: (moveRingVertex(mode.rings, drag.vertex, drag.position) ?? mode.rings);
	const parts = editedParts({ ...mode, rings: dragged }, cursor) ?? [dragged];
	const refused = editProblem({ ...mode, rings: dragged }) !== null;
	return [
		...parts.flatMap((rings) => {
			const [shell = [], ...holes] = rings;
			const shape = previewShape(mode.type, shell);
			const preview = shape === null ? null : withHoles(shape, holes.map(closeRing));
			return preview === null ? [] : [geometryFeature(preview, false, refused)];
		}),
		...parts.flatMap((rings) =>
			rings.flatMap((ring, ringIndex) =>
				ring.map((position, vertexIndex) =>
					pointFeature(position, {
						role: 'vertex',
						refused,
						ring: ringIndex,
						vertex: vertexIndex,
						highlighted: mode.selected?.ring === ringIndex && mode.selected.vertex === vertexIndex,
					}),
				),
			),
		),
		...sketchFeatures(mode, cursor, refused),
	];
}

/**
 * The sketched line as traced, with the cursor on the end of it.
 *
 * Drawn over the previewed pieces rather than instead of them, because a sketch
 * that has not done its job leaves the shape as it was and the line is the only
 * thing on screen saying why.
 */
function sketchFeatures(
	mode: EditMode,
	cursor: DrawPosition | null,
	refused: boolean,
): GeoJSON.Feature[] {
	if (mode.sketch === null) {
		return [];
	}
	const placed = mode.sketch.positions;
	const traced = cursor === null ? placed : [...placed, cursor];
	return [
		...(traced.length < 2
			? []
			: [geometryFeature({ type: 'LineString', coordinates: traced }, false, refused)]),
		...placed.map((position) => pointFeature(position, { role: 'vertex', refused })),
	];
}

/**
 * The shape in progress: the vertices placed so far, and the rubber band running
 * from the last of them to the cursor.
 *
 * A hole the control would refuse paints red, so the refusal is on the map and
 * not only under the Finish button. A point places nothing until it is committed,
 * so it draws none of this.
 */
function draftFeatures(
	mode: DrawMode,
	committed: DrawGeometry | null,
	vertices: readonly DrawPosition[],
	cursor: DrawPosition | null,
): GeoJSON.Feature[] {
	if (mode.type === 'Point') {
		return [];
	}
	const refused =
		holeDraftOf(mode, committed, vertices)?.problem != null ||
		continuedPartOf(mode, committed, vertices)?.problem != null;
	const shape = previewShape(mode.type, cursor === null ? vertices : [...vertices, cursor]);
	// A continuation's holes ride along with the preview, corners and all, so
	// cutting one and then extending the outline does not look like the hole has
	// gone. Each ring is closed, so its repeated first position is not drawn twice.
	const holes = continuedHoles(mode, committed);
	const preview = shape === null ? null : withHoles(shape, holes);
	return [
		...(preview === null ? [] : [geometryFeature(preview, false, refused)]),
		...[...vertices, ...holes.flatMap((ring) => ring.slice(0, -1))].map((vertex) =>
			pointFeature(vertex, { role: 'vertex', refused }),
		),
	];
}

/**
 * What the placed vertices look like before they are a shape: an area once three
 * of them close a ring, a line before that, and nothing at all below two.
 */
function previewShape(
	type: DrawGeometryType,
	preview: readonly DrawPosition[],
): DrawPartGeometry | null {
	if (type === 'Polygon' && preview.length >= 3) {
		return { type: 'Polygon', coordinates: [closeRing(preview)] };
	}
	return preview.length < 2 ? null : { type: 'LineString', coordinates: preview };
}

function partFeatures(part: DrawPartGeometry, highlighted: boolean): GeoJSON.Feature[] {
	if (part.type === 'Point') {
		return [pointFeature(part.coordinates, { role: 'point', highlighted })];
	}
	if (part.type === 'LineString') {
		return [
			geometryFeature(part, highlighted),
			...part.coordinates.map((position) =>
				pointFeature(position, { role: 'vertex', highlighted }),
			),
		];
	}
	// Every ring, so a hole's corners can be seen and counted the way the outline's
	// are. Each ring is closed, so its repeated first position is not drawn twice.
	return [
		geometryFeature(part, highlighted),
		...part.coordinates.flatMap((ring) =>
			ring.slice(0, -1).map((position) => pointFeature(position, { role: 'vertex', highlighted })),
		),
	];
}

function geometryFeature(
	geometry: DrawGeometry,
	highlighted = false,
	refused = false,
): GeoJSON.Feature {
	return {
		type: 'Feature',
		properties: { highlighted, refused },
		geometry: geometry as unknown as GeoJSON.Geometry,
	};
}

/**
 * One position as its own feature, carrying whatever the layers and the pointer
 * hit-test read off it.
 *
 * Properties rather than a fixed argument list because an edit's vertices carry
 * two more of them, the ring and the index, and every expression in
 * {@link drawLayers} already falls back to false for a property a feature does
 * not have.
 */
function pointFeature(
	position: DrawPosition,
	properties: GeoJSON.GeoJsonProperties,
): GeoJSON.Feature {
	return {
		type: 'Feature',
		properties,
		geometry: { type: 'Point', coordinates: [position[0], position[1]] },
	};
}

/**
 * The part the drawn vertices make, or `null` while there is not one yet.
 *
 * `canFinish` reads this too, so the covers-ground rule runs here rather than
 * beside the button: Finish would otherwise promise a write the server answers
 * 400. Three clicks in one spot passed `vertices.length < 3` and finished a
 * zero-area Polygon.
 */
function partFromVertices(
	type: DrawGeometryType,
	vertices: readonly DrawPosition[],
): DrawPartGeometry | null {
	const part = shapeFromVertices(type, vertices);
	return part !== null && geometryCoversGround(part) ? part : null;
}

/**
 * What a finished draw commits, which is a whole part for a replace or an add,
 * the part with one more ring in it for a hole, and the part redrawn with its
 * holes still in it for a continuation.
 *
 * `canFinish` and `finish` both read it, so the button and the commit cannot
 * disagree about whether the shape on screen is one the record can hold.
 */
function draftPart(
	mode: DrawMode,
	committed: DrawGeometry | null,
	vertices: readonly DrawPosition[],
): DrawPartGeometry | null {
	if (mode.target.kind === 'hole') {
		const part = drawParts(committed)[mode.target.partIndex];
		if (part === undefined || vertices.length < 3 || holeProblem(part, vertices) !== null) {
			return null;
		}
		return partWithHole(part, vertices);
	}
	const outline = partFromVertices(mode.type, vertices);
	if (outline === null || mode.target.kind !== 'continue') {
		return outline;
	}
	return continuationProblem(outline, mode, committed) === null
		? withHoles(outline, continuedHoles(mode, committed))
		: null;
}

/**
 * Why the outline a continuation has drawn cannot go back into the shape.
 *
 * An appended vertex can carve the outline inward, and a hole left outside it is
 * a polygon PostGIS calls invalid. The same {@link holeProblem} that refuses a
 * hole escaping while it is cut answers this, so the two refusals are one rule
 * read from either end.
 */
function continuationProblem(
	outline: DrawPartGeometry,
	mode: DrawMode,
	committed: DrawGeometry | null,
): DrawContinueProblem | null {
	const escaped = continuedHoles(mode, committed).some(
		(hole) => holeProblem(outline, hole) !== null,
	);
	return escaped ? 'holesEscape' : null;
}

/**
 * `part` with `vertices` cut out of it as one more ring, or null for a part that
 * has no inside to cut.
 *
 * Winding order is left exactly as drawn. GeoJSON asks for none, PostGIS ignores
 * it, and Mapbox's tessellator reads every ring past the first as a hole however
 * it is wound, so reversing one here would be a rule invented in this file.
 */
function partWithHole(
	part: DrawPartGeometry,
	vertices: readonly DrawPosition[],
): DrawPartGeometry | null {
	return part.type === 'Polygon'
		? { type: 'Polygon', coordinates: [...part.coordinates, closeRing(vertices)] }
		: null;
}

/**
 * The hole `mode` is drawing, or null while the draw is not one.
 *
 * The map reads it to paint a refused hole red and the toolbar reads it to name
 * the part, so a red draft and an enabled Finish cannot appear together.
 */
function holeDraftOf(
	mode: Mode,
	committed: DrawGeometry | null,
	vertices: readonly DrawPosition[],
): DrawHoleDraft | null {
	if (mode.kind !== 'draw' || mode.target.kind !== 'hole') {
		return null;
	}
	const part = drawParts(committed)[mode.target.partIndex];
	return {
		...partTargetOf(committed, mode.target.partIndex),
		problem: part === undefined ? null : holeProblem(part, dedupeTrailing(vertices)),
	};
}

/**
 * The part `mode` is continuing, or null while the draw is not one.
 *
 * The map reads it to paint a refused outline red and the toolbar reads it to
 * say what is wrong, so a red draft and an enabled Finish cannot appear
 * together.
 */
function continuedPartOf(
	mode: Mode,
	committed: DrawGeometry | null,
	vertices: readonly DrawPosition[],
): DrawContinueDraft | null {
	if (mode.kind !== 'draw' || mode.target.kind !== 'continue') {
		return null;
	}
	const outline = partFromVertices(mode.type, dedupeTrailing(vertices));
	return {
		...partTargetOf(committed, mode.target.partIndex),
		problem: outline === null ? null : continuationProblem(outline, mode, committed),
	};
}

function partTargetOf(committed: DrawGeometry | null, partIndex: number): DrawPartTarget {
	return { partNumber: partIndex + 1, partCount: drawParts(committed).length };
}

/**
 * What is wrong with a hole drawn into `part`, or null while nothing is.
 *
 * Containment is {@link geometryContainsLngLat}, which already reads a polygon's
 * holes as outside it, so "inside the outline and outside the other holes" is
 * one call rather than a second point-in-polygon written here. It reports from
 * the first stray vertex, before there are enough of them to close a ring, so
 * the draft turns red while the pointer is still moving.
 */
function holeProblem(
	part: DrawPartGeometry,
	vertices: readonly DrawPosition[],
): DrawHoleProblem | null {
	if (part.type !== 'Polygon') {
		return null;
	}
	const outside = vertices.some(([lng, lat]) => !geometryContainsLngLat(part, { lng, lat }));
	if (outside) {
		return 'escapes';
	}
	if (vertices.length < 3) {
		return null;
	}
	const cut = partWithHole(part, vertices);
	return cut !== null && geometryCoversGround(cut) ? null : 'swallows';
}

function shapeFromVertices(
	type: DrawGeometryType,
	vertices: readonly DrawPosition[],
): DrawPartGeometry | null {
	if (type === 'Point') {
		const point = vertices[0];
		return point === undefined ? null : { type: 'Point', coordinates: point };
	}
	if (type === 'LineString') {
		return vertices.length < 2 ? null : { type: 'LineString', coordinates: vertices };
	}
	return vertices.length < 3 ? null : { type: 'Polygon', coordinates: [closeRing(vertices)] };
}

// A double-click to finish lands as two near-identical clicks; drop a trailing
// vertex that duplicates the one before it so the saved shape has no zero-length
// final segment.
function dedupeTrailing(vertices: readonly DrawPosition[]): readonly DrawPosition[] {
	if (vertices.length < 2) {
		return vertices;
	}
	const last = vertices[vertices.length - 1];
	const previous = vertices[vertices.length - 2];
	if (last !== undefined && previous !== undefined && samePosition(last, previous)) {
		return vertices.slice(0, -1);
	}
	return vertices;
}

/**
 * What an edit commits: every piece it would leave, each ring closed, with the
 * same covers-ground rule a draw runs.
 *
 * `canFinish` reads it, so the button and the commit cannot disagree. One piece
 * for every path but a split, which leaves two. Holes are folded in one at a
 * time through {@link holeProblem}, which is the rule that refuses one while it
 * is being cut, so an edit that pushes a hole out of the outline is refused by
 * the same answer read from the other end.
 */
function editedPartsOf(mode: EditMode): readonly DrawPartGeometry[] | null {
	const edited = editedParts(mode);
	if (edited === null || (mode.sketch?.tool === 'split' && !mode.allowsParts)) {
		return null;
	}
	const built: DrawPartGeometry[] = [];
	for (const rings of edited) {
		const part = editedPartFrom(mode.type, rings);
		if (part === null) {
			return null;
		}
		built.push(part);
	}
	return built;
}

/** One piece of an edit: its outline, then each of its holes cut out in turn. */
function editedPartFrom(
	type: DrawGeometryType,
	rings: readonly DrawRing[],
): DrawPartGeometry | null {
	const [shell = [], ...holes] = rings;
	if (type === 'Point') {
		const position = shell[0];
		return position === undefined ? null : { type: 'Point', coordinates: position };
	}
	let part = partFromVertices(type, shell);
	const minimum = ringMinimum(type);
	for (const hole of holes) {
		// The same minimum {@link editProblem} names, so Finish and the message
		// under it cannot disagree about which ring is too short.
		if (part === null || !hasDistinctPositions(hole, minimum) || holeProblem(part, hole) !== null) {
			return null;
		}
		part = partWithHole(part, hole);
	}
	return part;
}

/**
 * The part `mode` is editing, or null while the draw is not one.
 *
 * The toolbar reads it to say what is wrong and which vertex Delete would take,
 * so a refused draft and an enabled Finish cannot appear together.
 */
function editDraftOf(mode: Mode, committed: DrawGeometry | null): DrawEditDraft | null {
	if (mode.kind !== 'edit') {
		return null;
	}
	return {
		...partTargetOf(committed, mode.partIndex),
		problem: editProblem(mode),
		selected: mode.selected,
		sketch:
			mode.sketch === null
				? null
				: { tool: mode.sketch.tool, vertices: mode.sketch.positions.length },
	};
}

/**
 * What is wrong with the rings as edited, or null while nothing is.
 *
 * Every refusal {@link editedPartsOf} makes has a name here, in the order the
 * rings are read: the record kind first, then a sketch that did not do its job,
 * then what is left of the pieces. This is what the map paints red, so the
 * message under the button and the colour on screen are one answer.
 */
function editProblem(mode: EditMode): DrawEditProblem | null {
	if (mode.sketch?.tool === 'split' && !mode.allowsParts) {
		return 'cannotHoldParts';
	}
	const parts = editedParts(mode);
	return parts === null ? sketchProblem(mode.sketch) : piecesProblem(mode, parts);
}

/**
 * Why a sketch left no pieces at all, or null while it is too short to have
 * done anything yet.
 *
 * The one place this vocabulary says null where Finish is still unavailable. A
 * sketch of one vertex or none is a draw in progress, the way one vertex of a
 * polygon is, and calling it a refusal would paint the piece red the moment the
 * tool was pressed.
 */
function sketchProblem(sketch: DrawSketch | null): DrawEditProblem | null {
	if (sketch !== null && sketch.positions.length < 2) {
		return null;
	}
	return sketch?.tool === 'split' ? 'doesNotDivide' : 'tooFewCrossings';
}

/**
 * What is wrong with the pieces the edit would leave, in the order the rings are
 * read: a ring with too few corners, then an outline enclosing nothing, then a
 * hole outside it.
 */
function piecesProblem(
	mode: EditMode,
	parts: readonly (readonly DrawRing[])[],
): DrawEditProblem | null {
	if (parts.flat().some((ring) => !hasDistinctPositions(ring, ringMinimum(mode.type)))) {
		return 'tooFewVertices';
	}
	if (parts.some(([shell = []]) => partFromVertices(mode.type, shell) === null)) {
		return 'coversNoGround';
	}
	return parts.some((rings) => rings.length > 1) && editedPartsOf(mode) === null
		? 'holesEscape'
		: null;
}

/**
 * The pieces the sketch would leave, the rings themselves when there is no
 * sketch, or null when the sketch cannot do what its tool means.
 *
 * A reshape leaves one piece and a split two, which is the whole difference
 * between the tools once the crossings are read. Reshape touches only the
 * outline, so the holes the part already had ride through untouched, and one the
 * new outline no longer contains is refused by the same `holesEscape` that
 * refuses a hole cut outside its piece. A split hands its own holes back,
 * because which piece each one belongs to is part of the cut.
 *
 * `trailing` is the cursor, so the result the map previews follows the pointer.
 * Everything that decides whether Finish may land reads the placed vertices
 * alone, which is how the draw path already separates the two.
 */
function editedParts(
	mode: EditMode,
	trailing: DrawPosition | null = null,
): readonly (readonly DrawRing[])[] | null {
	if (mode.sketch === null) {
		return [mode.rings];
	}
	const [shell, ...holes] = mode.rings;
	if (shell === undefined) {
		return null;
	}
	const placed = mode.sketch.positions;
	const sketch = dedupeTrailing(trailing === null ? placed : [...placed, trailing]);
	const closed = mode.type === 'Polygon';
	if (mode.sketch.tool === 'split') {
		const cut = splitRings({ rings: mode.rings, sketch, closed });
		return cut.kind === 'split' ? cut.parts.map((part) => [...part]) : null;
	}
	const outcome = reshapePath({ path: shell, sketch, closed });
	return outcome.kind === 'reshaped' ? [[outcome.path, ...holes]] : null;
}

/** How many distinct positions one ring of `type` needs to be worth anything. */
function ringMinimum(type: DrawGeometryType): number {
	if (type === 'Point') {
		return 1;
	}
	return type === 'LineString' ? 2 : 3;
}

/** Every vertex an edit is holding, the holes' corners included. */
function countRingVertices(rings: readonly DrawRing[]): number {
	return rings.reduce((total, ring) => total + ring.length, 0);
}

/**
 * `mode` with its last gesture taken back, stopping at the part as opened.
 *
 * An open sketch is unwound first, one vertex at a time, and an empty one is
 * what Undo closes. Without that last step a sketch nobody wanted could only be
 * left by abandoning the whole edit.
 */
function undoneEdit(mode: Mode): Mode {
	if (mode.kind !== 'edit') {
		return mode;
	}
	if (mode.sketch !== null) {
		const placed = mode.sketch.positions;
		return placed.length === 0
			? { ...mode, sketch: null }
			: { ...mode, sketch: { ...mode.sketch, positions: placed.slice(0, -1) } };
	}
	const rings = mode.history.at(-1);
	return rings === undefined
		? mode
		: { ...mode, rings, history: mode.history.slice(0, -1), selected: null };
}

/**
 * `mode` with a reshape sketch folded into the rings, or unchanged when the
 * sketch cannot reshape them.
 *
 * One Undo step, the way a moved vertex is, and the sketch is gone: what it left
 * behind is an outline the other gestures work on. Only reshape lands this way.
 * A split leaves two pieces, which is the part list's answer rather than a draft
 * this mode could go on holding, so its Finish commits.
 */
function landedSketch(mode: Mode): Mode {
	if (mode.kind !== 'edit' || mode.sketch === null) {
		return mode;
	}
	const rings = editedParts(mode)?.[0];
	return rings === undefined
		? mode
		: { ...mode, rings, history: [...mode.history, mode.rings], selected: null, sketch: null };
}

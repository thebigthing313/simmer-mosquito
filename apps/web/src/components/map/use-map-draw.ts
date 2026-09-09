import { mapInteraction } from '@simmer-mosquito/design-tokens';
import { type OwnedGeometryKind, ownedGeometryAllowsParts } from '@simmer-mosquito/domain';
import {
	boundsFromGeoJson,
	type DrawVertexRef,
	type GeoJsonGeometry,
	insertRingVertex,
	moveRingVertex,
	nearestRingEdge,
	type PlanarPath,
	type PlanarPosition,
	removeRingVertex,
	samePlanarPosition,
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
	useEffect,
	useEffectEvent,
	useRef,
	useState,
} from 'react';
import { drawFeatureFlag, drawFeatureIs, readDrawFeatureProperty } from './draw-feature-properties';
import { buildFeatures } from './draw-features';
import {
	continuedPartOf,
	continuedVertices,
	type DrawContinueDraft,
	type DrawDrag,
	type DrawEditDraft,
	type DrawGeometry,
	type DrawGeometryType,
	type DrawHoleDraft,
	type DrawPartGeometry,
	type DrawProgress,
	type DrawSketchTool,
	type DrawTarget,
	draftProgress,
	drawHoles,
	drawParts,
	editDraftOf,
	finishedParts,
	geometryFromParts,
	holeDraftOf,
	isRubberBanding,
	isSketching,
	landedSketch,
	type Mode,
	poppedTo,
	rejectPending,
	ringsOfPart,
	sameDrawGeometry,
	undoneEdit,
	vertexFloor,
	withParts,
} from './draw-parts';
import { isAimedAtMap } from './map-keys';
import { useGeoJsonSource } from './use-geojson-source';
import { isMapLive } from './use-mapbox-map';

/**
 * The vocabulary the draw control's callers name, re-exported from the module
 * that declares it.
 *
 * The algebra behind these moved to `./draw-parts` so it could be asked a
 * question without a map (#630). The hook is still the door the forms, the
 * toolbar and the part list know, so they keep naming it here rather than
 * learning a second path to the same types.
 */
export type {
	DrawContinueDraft,
	DrawEditDraft,
	DrawGeometry,
	DrawGeometryFor,
	DrawGeometryType,
	DrawHoleDraft,
	DrawPartGeometry,
} from './draw-parts';
export {
	drawHoles,
	drawParts,
	geometryFromParts,
	isDrawGeometryType,
	toDrawGeometry,
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
	vertexStroke: mapInteraction.vertexStroke,
	point: mapInteraction.selected,
	pointStroke: mapInteraction.pointStroke,
	refused: mapInteraction.refused,
	refusedStroke: mapInteraction.refusedStroke,
} as const;

const isPolygon: ExpressionSpecification = ['==', ['geometry-type'], 'Polygon'];
const isLine: ExpressionSpecification = ['==', ['geometry-type'], 'LineString'];
const isVertex: ExpressionSpecification = drawFeatureIs('role', 'vertex');
const isPoint: ExpressionSpecification = drawFeatureIs('role', 'point');

/**
 * Which part the pointer is over, picked out by weight rather than by a second
 * colour. A part is not a different kind of thing from the shape it belongs to,
 * so hovering a row thickens and fills it instead of recolouring it.
 */
function whenHighlighted(highlighted: number, rest: number): ExpressionSpecification {
	return ['case', drawFeatureFlag('highlighted'), highlighted, rest];
}

/**
 * The colour a draft paints in, red while the control would refuse it.
 *
 * Refusal is the one state that does get its own colour rather than more weight:
 * a hole that has wandered outside its piece is not a piece of the shape being
 * picked out, it is a shape that cannot be saved.
 */
function whenRefused(refused: string, rest: string): ExpressionSpecification {
	return ['case', drawFeatureFlag('refused'), refused, rest];
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
	const [vertices, setVertices] = useState<readonly PlanarPosition[]>([]);

	// Frequently-changing render inputs live in refs so the rubber band can be
	// repainted on mousemove without a React re-render per frame.
	const cursorRef = useRef<PlanarPosition | null>(null);
	const modeRef = useRef(mode);
	const verticesRef = useRef(vertices);
	const valueRef = useRef(value);
	const onChangeRef = useRef(onChange);

	// The writes are an effect rather than render-phase assignments, which is what
	// the React Compiler permits. Every read below happens after a commit, from an
	// effect or from a Mapbox pointer event, so the value each one sees is
	// unchanged. The effect is declared above its readers, so the write lands first
	// inside one commit.
	useEffect(() => {
		modeRef.current = mode;
		verticesRef.current = vertices;
		valueRef.current = value;
		onChangeRef.current = onChange;
	});

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

	const repaint = () => {
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
	};
	// `repaint` reads only refs and the map, so it is never what an effect reacts
	// to, and naming it in a dependency array would say otherwise. The effect below
	// reaches it through an effect event; the ordinary function stays for
	// `onEnsure` and the two inner hooks, which are call sites outside an effect.
	const repaintNow = useEffectEvent(() => {
		repaint();
	});

	// What the draft source holds after a real state change: a new committed value,
	// another vertex, a mode switch. The cursor and the drag are not here at all.
	// Both move every frame and ride `repaint` instead, so a mousemove repaints the
	// rubber band without re-rendering anything, and reading them here was a
	// render-phase ref read of what the map is currently showing, which is
	// commit-time information rather than render-time.
	const features = buildFeatures({
		committed: value,
		mode,
		vertices,
		cursor: null,
		drag: null,
		highlighted: highlightedPart,
	});

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

	// `features` carries no cursor and no drag, so the source has just been set to
	// the committed shape without the transients on it. Layering them back on is
	// `repaint`'s job, and this is the commit-time moment to do it. Declared after
	// the source primitive so its `setData` has already run.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `features` is the trigger rather than something the effect reads, and dropping it would stop the transients coming back after a state change.
	useEffect(() => {
		repaintNow();
	}, [features]);

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
	readonly cursorRef: { current: PlanarPosition | null };
	readonly dragRef: { current: DrawDrag | null };
	readonly modeRef: { current: Mode };
	readonly valueRef: { current: DrawGeometry | null };
	readonly verticesRef: { current: readonly PlanarPosition[] };
	readonly onChangeRef: { current: (value: DrawGeometry | null) => void };
	readonly finishRef: { current: () => void };
	readonly setMode: Dispatch<SetStateAction<Mode>>;
	readonly setVertices: Dispatch<SetStateAction<readonly PlanarPosition[]>>;
}): Pick<MapDrawController, 'start' | 'cancel' | 'commit' | 'undo' | 'finish' | 'requestPoint'> {
	// Nothing of the last draw survives a mode change: a pending point request is
	// told it was superseded, and the cursor, the grabbed vertex and the placed
	// vertices all go.
	const clear = () => {
		rejectPending(modeRef.current);
		cursorRef.current = null;
		dragRef.current = null;
		setVertices([]);
	};

	const start = (type: DrawGeometryType) => {
		// Starting a fresh draw clears every committed part, at any part count, so
		// the map shows exactly what the in-progress shape will become.
		clear();
		highlightPart(null);
		onChangeRef.current(null);
		setMode({ kind: 'draw', type, target: { kind: 'replace' } });
	};

	const cancel = () => {
		clear();
		setMode({ kind: 'idle' });
	};

	const commit = (geometry: DrawGeometry | null) => {
		clear();
		onChangeRef.current(geometry);
		setMode({ kind: 'idle' });
	};

	const undo = () => {
		if (modeRef.current.kind === 'edit') {
			setMode(undoneEdit);
			return;
		}
		setVertices((previous) => poppedTo(previous, vertexFloor(modeRef.current)));
	};

	// An open reshape is what Finish lands, and the Finish after that commits the
	// part. Two presses rather than one because the reshaped outline is still a
	// draft the other gestures can work on, the way a moved vertex is. A split
	// takes one press: two pieces are not a draft this mode can hold.
	const finish = () => {
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
	};
	// Written in an effect rather than during render, which is what the React
	// Compiler permits. The two readers are keyboard handlers registered inside
	// effects, so they read it after this commit either way.
	useEffect(() => {
		finishRef.current = finish;
	});

	const requestPoint = (_prompt?: string) =>
		new Promise<DrawGeometry & { readonly type: 'Point' }>((resolve, reject) => {
			if (!isMapLive(map)) {
				reject(new Error('The map is not ready yet.'));
				return;
			}
			clear();
			setMode({ kind: 'point', resolve, reject });
		});

	return { start, cancel, commit, undo, finish, requestPoint };
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
	const selectVertex = (vertex: DrawVertexRef | null) => {
		setMode((previous) =>
			previous.kind === 'edit' ? { ...previous, selected: vertex } : previous,
		);
	};

	const changeRings = (
		change: (rings: readonly PlanarPath[]) => readonly PlanarPath[] | null,
		selected: (rings: readonly PlanarPath[]) => DrawVertexRef | null,
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
	};

	const moveVertex = (vertex: DrawVertexRef, position: PlanarPosition) => {
		changeRings(
			(rings) => moveRingVertex(rings, vertex, position),
			() => vertex,
		);
	};

	// The new vertex is picked, so clicking an edge and pressing Delete undoes
	// itself rather than removing whichever corner happened to be picked before.
	const insertVertex = (edge: DrawVertexRef, position: PlanarPosition) => {
		changeRings(
			(rings) => insertRingVertex(rings, edge, position),
			() => ({ ring: edge.ring, vertex: edge.vertex + 1 }),
		);
	};

	// Nothing stays picked: every index after the one dropped has shifted, so a
	// pick kept here would name a different corner than the one on screen did.
	const deleteVertex = (vertex: DrawVertexRef) => {
		changeRings(
			(rings) => removeRingVertex(rings, vertex),
			() => null,
		);
	};

	// A point has one corner and no boundary a line could cross, so there is
	// nothing here to sketch across. The pick goes because the vertex gestures are
	// off for as long as the sketch is open.
	const openSketch = (tool: DrawSketchTool) => {
		setMode((previous) =>
			previous.kind === 'edit' && previous.type !== 'Point'
				? { ...previous, selected: null, sketch: { tool, positions: [] } }
				: previous,
		);
	};
	const startReshape = () => openSketch('reshape');
	// Not refused here even where the record kind cannot hold two pieces. The
	// draft names that refusal and the toolbar says it, which is the only place
	// the user would find out why the tool did nothing.
	const startSplit = () => openSketch('split');

	// Not through `changeRings`: a sketch vertex changes no ring, and Undo pops it
	// one at a time rather than taking the whole sketch back at once.
	const sketchVertex = (position: PlanarPosition) => {
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
	};

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
	readonly cursorRef: { current: PlanarPosition | null };
	readonly dragRef: { current: DrawDrag | null };
	readonly modeRef: { current: Mode };
	readonly valueRef: { current: DrawGeometry | null };
	readonly onChangeRef: { current: (value: DrawGeometry | null) => void };
	readonly setMode: (next: Mode) => void;
	readonly setVertices: (next: readonly PlanarPosition[]) => void;
}) {
	const [highlightedPart, setHighlightedPart] = useState<number | null>(null);
	const highlightedRef = useRef(highlightedPart);
	// Written in an effect rather than during render, which is what the React
	// Compiler permits. `repaint` is the only reader and runs from an effect or a
	// Mapbox event, so it reads the same value it did before.
	useEffect(() => {
		highlightedRef.current = highlightedPart;
	});

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
	const applyParts = (target: DrawTarget, parts: readonly DrawPartGeometry[]) => {
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
	};

	// The base shape comes off the committed parts rather than off the toggle:
	// they are the thing being added to, and a toggle change has already cleared
	// them.
	const startPart = () => {
		const base = drawParts(valueRef.current)[0]?.type;
		if (base === undefined) {
			return;
		}
		rejectPending(modeRef.current);
		cursorRef.current = null;
		setVertices([]);
		setHighlightedPart(null);
		setMode({ kind: 'draw', type: base, target: { kind: 'part' } });
	};

	// Refused here rather than left to whichever button happens to be hidden. A
	// part that is not an area has no inside, and the containment check would read
	// its coordinate pair as a ring and call every vertex of the hole escaped.
	const startHole = (index: number) => {
		const part = drawParts(valueRef.current)[index];
		if (part?.type !== 'Polygon') {
			return;
		}
		rejectPending(modeRef.current);
		cursorRef.current = null;
		setVertices([]);
		setHighlightedPart(null);
		setMode({ kind: 'draw', type: 'Polygon', target: { kind: 'hole', partIndex: index } });
	};

	// The part stays committed through the continuation, so Cancel and Escape put
	// it back with nothing to restore: the draw is abandoned and the part is still
	// where it was. What is committed is what the map draws, so the draft takes
	// over drawing this one part while the mode is on it.
	const continuePart = (index: number) => {
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
	};

	// Every ring the part has, not just its outline: a hole is edited with the same
	// three gestures as the shell, so all of them are seeded together and go back
	// together. The part stays committed through the edit, so Cancel and Escape put
	// it back with nothing to restore, holes included.
	const editPart = (index: number) => {
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
			allowsParts: geometryKind !== undefined && ownedGeometryAllowsParts(geometryKind, part.type),
		});
	};

	const removePart = (index: number) => {
		setHighlightedPart(null);
		onChangeRef.current(
			geometryFromParts(drawParts(valueRef.current).filter((_, at) => at !== index)),
		);
	};

	// `holeIndex` counts holes, not rings, so nothing outside this file has to
	// know that ring zero is the outline.
	const removeHole = (partIndex: number, holeIndex: number) => {
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
	};

	const zoomToPart = (index: number) => {
		const part = drawParts(valueRef.current)[index];
		if (part === undefined || !isMapLive(map)) {
			return;
		}
		fitMapToGeometry(map, part);
	};

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
	readonly cursorRef: { current: PlanarPosition | null };
	readonly dragRef: { current: DrawDrag | null };
	readonly repaint: () => void;
	readonly applyParts: (target: DrawTarget, parts: readonly DrawPartGeometry[]) => void;
	readonly finishRef: { current: () => void };
	readonly setMode: (next: Mode) => void;
	readonly setVertices: (
		next:
			| readonly PlanarPosition[]
			| ((previous: readonly PlanarPosition[]) => readonly PlanarPosition[]),
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
			const position: PlanarPosition = [event.lngLat.lng, event.lngLat.lat];
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
	readonly cursorRef: { current: PlanarPosition | null };
	readonly dragRef: { current: DrawDrag | null };
	readonly repaint: () => void;
	readonly moveVertex: (vertex: DrawVertexRef, position: PlanarPosition) => void;
	readonly insertVertex: (edge: DrawVertexRef, position: PlanarPosition) => void;
	readonly deleteVertex: (vertex: DrawVertexRef) => void;
	readonly selectVertex: (vertex: DrawVertexRef | null) => void;
	readonly sketchVertex: (position: PlanarPosition) => void;
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
			if (from !== undefined && !samePlanarPosition(from, drag.position)) {
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
			const position: PlanarPosition = [event.lngLat.lng, event.lngLat.lat];
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

/** The vertex under the pointer, read off the feature the map answers with. */
function vertexUnder(map: MapboxMap, event: MapMouseEvent): DrawVertexRef | null {
	const [feature] = map.queryRenderedFeatures(hitBox(event), { layers: [VERTEX_LAYER] });
	const ring = readDrawFeatureProperty(feature, 'ring');
	const vertex = readDrawFeatureProperty(feature, 'vertex');
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

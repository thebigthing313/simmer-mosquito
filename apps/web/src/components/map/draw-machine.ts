/**
 * The draw control's state machine: every transition the control makes, as one
 * pure function, {@link next}.
 *
 * Nothing here touches Mapbox or React. A transition takes the state, the event
 * and what the control reads without owning it, and answers with the next state
 * and the side effects to run. `use-map-draw.ts` is the adapter: it holds the
 * state, turns pointer and key input into events, and runs the effects. The
 * shape questions a transition asks go to the part algebra in `./draw-parts`,
 * which this calls and does not change.
 *
 * Every transition that leaves a draft goes through {@link leaveDraft}, so the
 * cursor, the grabbed vertex, the placed vertices and a pending point request
 * are reset the same way on every exit (#1425).
 */

import { type OwnedGeometryKind, ownedGeometryAllowsParts } from '@simmer-mosquito/domain';
import {
	type DrawVertexRef,
	insertRingVertex,
	moveRingVertex,
	nearestRingEdge,
	type PlanarPath,
	type PlanarPosition,
	removeRingVertex,
	samePlanarPosition,
} from '@simmer-mosquito/mapping';
import {
	continuedPartOf,
	continuedVertices,
	type DrawDrag,
	type DrawGeometry,
	type DrawGeometryType,
	type DrawPartGeometry,
	type DrawReadings,
	type DrawSketchTool,
	type DrawTarget,
	draftProgress,
	drawHoles,
	drawParts,
	type EditMode,
	editDraftOf,
	finishedParts,
	geometryFromParts,
	holeDraftOf,
	isRubberBanding,
	landedSketch,
	type Mode,
	poppedTo,
	ringsOfPart,
	sameDrawGeometry,
	undoneEdit,
	vertexFloor,
	withParts,
} from './draw-parts';

/** A point the map handed back, which is what a point request resolves with. */
export type DrawPoint = DrawGeometry & { readonly type: 'Point' };

/**
 * Everything the control holds. `mode`, `vertices` and `highlighted` are what a
 * render reads; `cursor` and `drag` move every frame and are only painted.
 */
export interface DrawState {
	readonly mode: Mode;
	readonly vertices: readonly PlanarPosition[];
	readonly highlighted: number | null;
	readonly cursor: PlanarPosition | null;
	readonly drag: DrawDrag | null;
}

/** What a transition reads and does not own: the committed shape and the record kind. */
export interface DrawContext {
	readonly value: DrawGeometry | null;
	/** Omitted where the caller never opens a part, which is what refuses a split there. */
	readonly geometryKind?: OwnedGeometryKind | undefined;
}

export const IDLE_DRAW_STATE: DrawState = {
	mode: { kind: 'idle' },
	vertices: [],
	highlighted: null,
	cursor: null,
	drag: null,
};

/**
 * Why a pending point request was turned down. `superseded` is a new draft or a
 * new request opening over it; `cancelled` is the user abandoning it, by Escape
 * or by the Cancel control.
 */
export type DrawPointRejection = 'superseded' | 'cancelled';

export type DrawEffect =
	/** Report a new committed shape to `onChange`. */
	| { readonly kind: 'emit'; readonly geometry: DrawGeometry | null }
	| { readonly kind: 'resolvePoint'; readonly point: DrawPoint }
	| { readonly kind: 'rejectPoint'; readonly reason: DrawPointRejection }
	/** Fit the map to one part. */
	| { readonly kind: 'frame'; readonly part: DrawPartGeometry };

/**
 * The controller's actions, then the edit gestures, then the input the adapter
 * translates from the map and the keyboard. Enter arrives as `finish` and Escape
 * as `cancel`, because each is the same act as the control it stands for.
 */
export type DrawEvent =
	| { readonly type: 'start'; readonly drawType: DrawGeometryType }
	| { readonly type: 'startPart' }
	| { readonly type: 'startHole'; readonly partIndex: number }
	| { readonly type: 'continuePart'; readonly partIndex: number }
	| { readonly type: 'editPart'; readonly partIndex: number }
	| { readonly type: 'cancel' }
	| { readonly type: 'commit'; readonly geometry: DrawGeometry | null }
	| { readonly type: 'undo' }
	| { readonly type: 'finish' }
	| { readonly type: 'requestPoint' }
	| { readonly type: 'highlightPart'; readonly partIndex: number | null }
	| { readonly type: 'removePart'; readonly partIndex: number }
	| { readonly type: 'removeHole'; readonly partIndex: number; readonly holeIndex: number }
	| { readonly type: 'zoomToPart'; readonly partIndex: number }
	| { readonly type: 'selectVertex'; readonly vertex: DrawVertexRef | null }
	| {
			readonly type: 'moveVertex';
			readonly vertex: DrawVertexRef;
			readonly position: PlanarPosition;
	  }
	| {
			readonly type: 'insertVertex';
			readonly edge: DrawVertexRef;
			readonly position: PlanarPosition;
	  }
	| { readonly type: 'deleteVertex'; readonly vertex: DrawVertexRef }
	| { readonly type: 'startReshape' }
	| { readonly type: 'startSplit' }
	| { readonly type: 'sketchVertex'; readonly position: PlanarPosition }
	/** A click on the map outside an edit: places a vertex or answers a point request. */
	| { readonly type: 'click'; readonly position: PlanarPosition }
	/**
	 * A click on the map during an edit, with what the adapter found under it. Its
	 * own event because only the edit listener reads the layers under the pointer.
	 */
	| {
			readonly type: 'editClick';
			readonly position: PlanarPosition;
			readonly vertex: DrawVertexRef | null;
			readonly overEdge: boolean;
	  }
	| { readonly type: 'move'; readonly position: PlanarPosition }
	| { readonly type: 'doubleClick' }
	/** Delete or Backspace on the map: drops the picked vertex. */
	| { readonly type: 'deleteSelected' }
	| { readonly type: 'grab'; readonly vertex: DrawVertexRef; readonly position: PlanarPosition }
	| { readonly type: 'release' }
	/**
	 * The edit listeners going away with a vertex still held. The vertex is let go
	 * where it was grabbed rather than landed, because no release ever came.
	 */
	| { readonly type: 'dropDrag' };

export interface DrawTransition {
	readonly state: DrawState;
	readonly effects: readonly DrawEffect[];
}

/**
 * How the adapter's listeners hand it an event. They get the state on both sides
 * of it back, because whether a gesture is claimed from Mapbox or the browser
 * reads the state the event arrived in, and the cursor's shape reads the state
 * it left behind.
 */
export type DrawDispatch = (event: DrawEvent) => {
	readonly previous: DrawState;
	readonly state: DrawState;
};

/** One transition, for the event of type `K`. */
type Transition<K extends DrawEvent['type']> = (
	state: DrawState,
	event: Extract<DrawEvent, { readonly type: K }>,
	context: DrawContext,
) => DrawTransition;

/**
 * Every event's transition, keyed by the event's type. A table rather than one
 * switch, so each transition is its own small function and the compiler holds
 * the table to the event union: an event with no transition fails `tsc`.
 */
const TRANSITIONS: { readonly [K in DrawEvent['type']]: Transition<K> } = {
	// A fresh draw clears every committed part, at any part count, so the map
	// shows exactly what the in-progress shape will become.
	start: (state, { drawType }) =>
		withEffect(
			leaveDraft(state, {
				mode: { kind: 'draw', type: drawType, target: { kind: 'replace' } },
				highlighted: null,
				pending: 'superseded',
			}),
			{ kind: 'emit', geometry: null },
		),
	startPart: (state, _event, context) => startPart(state, context),
	startHole: (state, { partIndex }, context) => startHole(state, partIndex, context),
	continuePart: (state, { partIndex }, context) => continuePart(state, partIndex, context),
	editPart: (state, { partIndex }, context) => editPart(state, partIndex, context),
	cancel: (state) => leaveDraft(state, { mode: { kind: 'idle' }, pending: 'cancelled' }),
	commit: (state, { geometry }) =>
		withEffect(leaveDraft(state, { mode: { kind: 'idle' }, pending: 'superseded' }), {
			kind: 'emit',
			geometry,
		}),
	undo: (state) => undo(state),
	finish: (state, _event, context) => finish(state, context),
	requestPoint: (state) => leaveDraft(state, { mode: { kind: 'point' }, pending: 'superseded' }),
	highlightPart: (state, { partIndex }) =>
		unchanged(partIndex === state.highlighted ? state : { ...state, highlighted: partIndex }),
	removePart: (state, { partIndex }, context) => ({
		state: state.highlighted === null ? state : { ...state, highlighted: null },
		effects: [
			{
				kind: 'emit',
				geometry: geometryFromParts(drawParts(context.value).filter((_, at) => at !== partIndex)),
			},
		],
	}),
	removeHole: (state, { partIndex, holeIndex }, context) =>
		removeHole(state, partIndex, holeIndex, context),
	zoomToPart: (state, { partIndex }, context) => {
		const part = drawParts(context.value)[partIndex];
		return part === undefined ? unchanged(state) : { state, effects: [{ kind: 'frame', part }] };
	},
	selectVertex: (state, { vertex }) => withEdit(state, (mode) => ({ ...mode, selected: vertex })),
	moveVertex: (state, { vertex, position }) =>
		changeRings(
			state,
			(rings) => moveRingVertex(rings, vertex, position),
			() => vertex,
		),
	insertVertex: (state, { edge, position }) => insertVertex(state, edge, position),
	deleteVertex: (state, { vertex }) => deleteVertex(state, vertex),
	startReshape: (state) => openSketch(state, 'reshape'),
	// Not refused here even where the record kind cannot hold two pieces. The
	// draft names that refusal and the toolbar says it, which is the only place
	// the user would find out why the tool did nothing.
	startSplit: (state) => openSketch(state, 'split'),
	sketchVertex: (state, { position }) => sketchVertex(state, position),
	click: (state, { position }, context) => click(state, position, context),
	editClick: (state, event) => editClick(state, event),
	move: (state, { position }) => move(state, position),
	// A sketch completes the way a draw does rather than needing a gesture of its
	// own.
	doubleClick: (state, _event, context) =>
		isRubberBanding(state.mode) ? finish(state, context) : unchanged(state),
	deleteSelected: (state) => {
		const selected = deletableVertex(state.mode);
		return selected === null ? unchanged(state) : deleteVertex(state, selected);
	},
	grab: (state, { vertex, position }) => grab(state, vertex, position),
	release: (state) => release(state),
	dropDrag: (state) => unchanged(state.drag === null ? state : { ...state, drag: null }),
};

/** The state after `event`, and the side effects the adapter runs for it. */
export function next(state: DrawState, event: DrawEvent, context: DrawContext): DrawTransition {
	// The table is keyed by the event's own type, so the transition looked up
	// is the one written for this event. TypeScript cannot correlate the two
	// through a union index, which is the whole of the cast.
	const transition = TRANSITIONS[event.type] as Transition<DrawEvent['type']>;
	return transition(state, event, context);
}

/**
 * The controller's reading of a state against the committed shape. The adapter
 * spreads it into what it returns, and the machine's suite asserts on it, so
 * the two read the draft through one function.
 */
export function drawView(
	{ mode, vertices }: Pick<DrawState, 'mode' | 'vertices'>,
	value: DrawGeometry | null,
): DrawReadings {
	return {
		isDrawing: mode.kind === 'draw' || mode.kind === 'edit',
		isAddingPart: mode.kind === 'draw' && mode.target.kind === 'part',
		isRequestingPoint: mode.kind === 'point',
		...draftProgress(mode, value, vertices),
		continuedPart: continuedPartOf(mode, value, vertices),
		editedPart: editDraftOf(mode, value),
		holeDraft: holeDraftOf(mode, value, vertices),
	};
}

/**
 * The vertex Delete would take: the picked one, while an edit has no sketch
 * open. The edit listener claims the key from the browser on the same answer,
 * so the two cannot disagree about whether a Delete was meant for the shape.
 */
export function deletableVertex(mode: Mode): DrawVertexRef | null {
	return mode.kind === 'edit' && mode.sketch === null ? mode.selected : null;
}

// Nothing stays picked: every index after the one dropped has shifted, so a pick
// kept here would name a different corner than the one on screen did.
function deleteVertex(state: DrawState, vertex: DrawVertexRef): DrawTransition {
	return changeRings(
		state,
		(rings) => removeRingVertex(rings, vertex),
		() => null,
	);
}

// An open sketch takes the pointer over completely, so no vertex can be grabbed
// until it has landed.
function grab(state: DrawState, vertex: DrawVertexRef, position: PlanarPosition): DrawTransition {
	if (state.mode.kind !== 'edit' || state.mode.sketch !== null) {
		return unchanged(state);
	}
	return unchanged({
		...state,
		mode: { ...state.mode, selected: vertex },
		drag: { vertex, position },
	});
}

/**
 * The one way out of a draft. The cursor and the grabbed vertex go, the
 * vertices become what the next mode opens with, and a pending point request is
 * resolved or turned down with the reason the exit gives.
 *
 * The highlight is the exit's own call: the openers clear it and the closers
 * leave it where it was. Omitted keeps it.
 */
function leaveDraft(
	state: DrawState,
	{
		mode,
		vertices = [],
		highlighted = state.highlighted,
		pending,
	}: {
		readonly mode: Mode;
		readonly vertices?: readonly PlanarPosition[];
		readonly highlighted?: number | null;
		readonly pending: DrawPointRejection | { readonly point: DrawPoint };
	},
): DrawTransition {
	const effects: DrawEffect[] = [];
	if (state.mode.kind === 'point') {
		effects.push(
			typeof pending === 'string'
				? { kind: 'rejectPoint', reason: pending }
				: { kind: 'resolvePoint', point: pending.point },
		);
	}
	return { state: { mode, vertices, highlighted, cursor: null, drag: null }, effects };
}

// The base shape comes off the committed parts rather than off the toggle: they
// are the thing being added to, and a toggle change has already cleared them.
function startPart(state: DrawState, context: DrawContext): DrawTransition {
	const base = drawParts(context.value)[0]?.type;
	if (base === undefined) {
		return unchanged(state);
	}
	return leaveDraft(state, {
		mode: { kind: 'draw', type: base, target: { kind: 'part' } },
		highlighted: null,
		pending: 'superseded',
	});
}

// A part that is not an area has no inside, and the containment check would read
// its coordinate pair as a ring and call every vertex of the hole escaped.
function startHole(state: DrawState, partIndex: number, context: DrawContext): DrawTransition {
	const part = drawParts(context.value)[partIndex];
	if (part?.type !== 'Polygon') {
		return unchanged(state);
	}
	return leaveDraft(state, {
		mode: { kind: 'draw', type: 'Polygon', target: { kind: 'hole', partIndex } },
		highlighted: null,
		pending: 'superseded',
	});
}

// The part stays committed through the continuation, so Cancel and Escape put it
// back with nothing to restore. What is committed is what the map draws, so the
// draft takes over drawing this one part while the mode is on it.
function continuePart(state: DrawState, partIndex: number, context: DrawContext): DrawTransition {
	const part = drawParts(context.value)[partIndex];
	const seeded = part === undefined ? null : continuedVertices(part);
	if (part === undefined || seeded === null) {
		return unchanged(state);
	}
	return leaveDraft(state, {
		mode: {
			kind: 'draw',
			type: part.type,
			target: { kind: 'continue', partIndex, seeded: seeded.length },
		},
		vertices: seeded,
		highlighted: null,
		pending: 'superseded',
	});
}

// Every ring the part has, not just its outline: a hole is edited with the same
// gestures as the shell, so all of them are seeded together and go back together.
function editPart(state: DrawState, partIndex: number, context: DrawContext): DrawTransition {
	const part = drawParts(context.value)[partIndex];
	if (part === undefined) {
		return unchanged(state);
	}
	const { geometryKind } = context;
	return leaveDraft(state, {
		mode: {
			kind: 'edit',
			type: part.type,
			partIndex,
			rings: ringsOfPart(part),
			history: [],
			selected: null,
			sketch: null,
			allowsParts: geometryKind !== undefined && ownedGeometryAllowsParts(geometryKind, part.type),
		},
		highlighted: null,
		pending: 'superseded',
	});
}

function undo(state: DrawState): DrawTransition {
	if (state.mode.kind === 'edit') {
		const mode = undoneEdit(state.mode);
		return unchanged(mode === state.mode ? state : { ...state, mode });
	}
	const vertices = poppedTo(state.vertices, vertexFloor(state.mode));
	return unchanged(vertices === state.vertices ? state : { ...state, vertices });
}

// An open reshape is what Finish lands, and the Finish after that commits the
// part. A split takes one press: two pieces are not a draft this mode can hold.
function finish(state: DrawState, context: DrawContext): DrawTransition {
	const { mode } = state;
	if (mode.kind === 'edit' && mode.sketch?.tool === 'reshape') {
		return unchanged({ ...state, mode: landedSketch(mode), cursor: null });
	}
	const finished = finishedParts(mode, context.value, state.vertices);
	return finished === null
		? unchanged(state)
		: applyParts(state, finished.target, finished.parts, context);
}

/**
 * The one place a finished draw lands. `replace` throws the committed parts
 * away, `part` appends to them, `hole`, `continue` and `edit` put back the part
 * they name.
 *
 * A finish that leaves the shape where it was reports nothing. The form reads
 * any report as a redraw, and on a habitat a redraw names
 * `updateHabitatLocation`, which sits at the manager floor, so a collector's
 * details-only save was refused for a shape nobody moved (#472). The draw still
 * ends either way.
 */
function applyParts(
	state: DrawState,
	target: DrawTarget,
	parts: readonly DrawPartGeometry[],
	context: DrawContext,
): DrawTransition {
	const geometry = geometryFromParts(withParts(drawParts(context.value), target, parts));
	const left = leaveDraft(state, { mode: { kind: 'idle' }, pending: 'superseded' });
	return sameDrawGeometry(geometry, context.value)
		? left
		: withEffect(left, { kind: 'emit', geometry });
}

// `holeIndex` counts holes, not rings, so nothing outside this file has to know
// that ring zero is the outline.
function removeHole(
	state: DrawState,
	partIndex: number,
	holeIndex: number,
	context: DrawContext,
): DrawTransition {
	const parts = drawParts(context.value);
	const part = parts[partIndex];
	if (part?.type !== 'Polygon' || drawHoles(part)[holeIndex] === undefined) {
		return unchanged(state);
	}
	const rings = part.coordinates.filter((_, at) => at !== holeIndex + 1);
	return {
		state,
		effects: [
			{
				kind: 'emit',
				geometry: geometryFromParts(
					parts.map((at, index) =>
						index === partIndex ? { type: 'Polygon', coordinates: rings } : at,
					),
				),
			},
		],
	};
}

/** `state` with its edit mode rewritten, or unchanged outside an edit. */
function withEdit(state: DrawState, change: (mode: EditMode) => EditMode): DrawTransition {
	return unchanged(state.mode.kind === 'edit' ? { ...state, mode: change(state.mode) } : state);
}

/**
 * A ring change, which costs exactly one Undo step. Refused, it costs nothing
 * and the mode stays the object it was.
 */
function changeRings(
	state: DrawState,
	change: (rings: readonly PlanarPath[]) => readonly PlanarPath[] | null,
	selected: (rings: readonly PlanarPath[]) => DrawVertexRef | null,
): DrawTransition {
	if (state.mode.kind !== 'edit') {
		return unchanged(state);
	}
	const rings = change(state.mode.rings);
	if (rings === null) {
		return unchanged(state);
	}
	return withEdit(state, (mode) => ({
		...mode,
		rings,
		history: [...mode.history, mode.rings],
		selected: selected(rings),
	}));
}

// A point has one corner and no boundary a line could cross, so there is nothing
// to sketch across. The pick goes because the vertex gestures are off for as
// long as the sketch is open.
function openSketch(state: DrawState, tool: DrawSketchTool): DrawTransition {
	if (state.mode.kind !== 'edit' || state.mode.type === 'Point') {
		return unchanged(state);
	}
	return withEdit(state, (mode) => ({ ...mode, selected: null, sketch: { tool, positions: [] } }));
}

// Not a ring change: a sketch vertex changes no ring, and Undo pops it one at a
// time rather than taking the whole sketch back at once.
function sketchVertex(state: DrawState, position: PlanarPosition): DrawTransition {
	if (state.mode.kind !== 'edit' || state.mode.sketch === null) {
		return unchanged(state);
	}
	return withEdit(state, (mode) =>
		mode.sketch === null
			? mode
			: { ...mode, sketch: { ...mode.sketch, positions: [...mode.sketch.positions, position] } },
	);
}

function click(state: DrawState, position: PlanarPosition, context: DrawContext): DrawTransition {
	const { mode } = state;
	if (mode.kind === 'point') {
		return leaveDraft(state, {
			mode: { kind: 'idle' },
			pending: { point: { type: 'Point', coordinates: position } },
		});
	}
	if (mode.kind !== 'draw') {
		return unchanged(state);
	}
	// A point piece finishes on its first click, the way a first point does.
	if (mode.type === 'Point') {
		return applyParts(state, mode.target, [{ type: 'Point', coordinates: position }], context);
	}
	return unchanged({ ...state, vertices: [...state.vertices, position] });
}

// An open sketch takes every click. Otherwise a vertex under the pointer is
// picked, and a click on the boundary, not the fill, inserts on the nearest edge:
// a click in the middle of an area is not aimed at an edge, and inserting on the
// nearest one would be a guess.
function editClick(
	state: DrawState,
	{
		position,
		vertex,
		overEdge,
	}: {
		readonly position: PlanarPosition;
		readonly vertex: DrawVertexRef | null;
		readonly overEdge: boolean;
	},
): DrawTransition {
	const { mode } = state;
	if (mode.kind !== 'edit') {
		return unchanged(state);
	}
	if (mode.sketch !== null) {
		return sketchVertex(state, position);
	}
	if (vertex !== null) {
		return withEdit(state, (edit) => ({ ...edit, selected: vertex }));
	}
	const edge = overEdge ? nearestRingEdge(mode.rings, position, mode.type === 'Polygon') : null;
	if (edge === null) {
		return withEdit(state, (edit) => ({ ...edit, selected: null }));
	}
	return insertVertex(state, edge, position);
}

// The new vertex is picked, so clicking an edge and pressing Delete undoes itself
// rather than removing whichever corner happened to be picked before.
function insertVertex(
	state: DrawState,
	edge: DrawVertexRef,
	position: PlanarPosition,
): DrawTransition {
	return changeRings(
		state,
		(rings) => insertRingVertex(rings, edge, position),
		() => ({ ring: edge.ring, vertex: edge.vertex + 1 }),
	);
}

// The rubber band and the grabbed vertex both trail the pointer. Neither is a
// state a render reads, and a move to where the pointer already was is no change.
function move(state: DrawState, position: PlanarPosition): DrawTransition {
	if (isRubberBanding(state.mode)) {
		return state.cursor !== null && samePlanarPosition(state.cursor, position)
			? unchanged(state)
			: unchanged({ ...state, cursor: position });
	}
	const { drag } = state;
	if (state.mode.kind === 'edit' && drag !== null) {
		return samePlanarPosition(drag.position, position)
			? unchanged(state)
			: unchanged({ ...state, drag: { vertex: drag.vertex, position } });
	}
	return unchanged(state);
}

// The drag's own last position is where it lands: a release off the canvas has no
// map coordinate to read. A click on a vertex is a grab and a release in one
// spot, and landing it as a move would cost an Undo step that took nothing back.
function release(state: DrawState): DrawTransition {
	const { drag, mode } = state;
	if (drag === null) {
		return unchanged(state);
	}
	const released = { ...state, drag: null };
	if (mode.kind !== 'edit') {
		return unchanged(released);
	}
	const from = mode.rings[drag.vertex.ring]?.[drag.vertex.vertex];
	if (from === undefined || samePlanarPosition(from, drag.position)) {
		return unchanged(released);
	}
	return changeRings(
		released,
		(rings) => moveRingVertex(rings, drag.vertex, drag.position),
		() => drag.vertex,
	);
}

function unchanged(state: DrawState): DrawTransition {
	return { state, effects: [] };
}

function withEffect(transition: DrawTransition, effect: DrawEffect): DrawTransition {
	return { state: transition.state, effects: [...transition.effects, effect] };
}

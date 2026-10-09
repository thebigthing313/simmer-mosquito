import type { OwnedGeometryKind } from '@simmer-mosquito/domain';
import type { PlanarPosition } from '@simmer-mosquito/mapping';
import { describe, expect, it } from 'vitest';
import { buildFeatures } from '../../../../components/map/draw-features';
import {
	type DrawContext,
	type DrawEffect,
	type DrawEvent,
	type DrawState,
	drawView,
	IDLE_DRAW_STATE,
	next,
} from '../../../../components/map/draw-machine';
import {
	type DrawGeometry,
	drawHoles,
	drawParts,
	type Mode,
} from '../../../../components/map/draw-parts';

/** A four-corner area with room inside it, committed as the shape being drawn on. */
const BLOCK: readonly PlanarPosition[] = [
	[-91, 34],
	[-91, 37],
	[-88, 37],
	[-88, 34],
];
const COMMITTED: DrawGeometry = { type: 'Polygon', coordinates: [[...BLOCK, [-91, 34]]] };
const CONTEXT: DrawContext = { value: COMMITTED, geometryKind: 'habitat' };

const TRIANGLE: readonly PlanarPosition[] = [
	[-90, 35],
	[-90, 36],
	[-89, 36],
];

/**
 * An area draft three corners in, with every transient set: the cursor trailing,
 * a vertex held, and the second piece picked out in the part list. An exit that
 * forgets any of them leaves it behind here.
 */
const OPEN_DRAFT: DrawState = {
	mode: { kind: 'draw', type: 'Polygon', target: { kind: 'replace' } },
	vertices: TRIANGLE,
	highlighted: 1,
	cursor: [-89.5, 35.5],
	drag: { vertex: { ring: 0, vertex: 0 }, position: [-89.9, 35.1] },
};

const PENDING_POINT: DrawState = {
	mode: { kind: 'point' },
	vertices: [],
	highlighted: 1,
	cursor: [-89.5, 35.5],
	drag: null,
};

const DRAW_TRIANGLE: DrawGeometry = { type: 'Polygon', coordinates: [[...TRIANGLE, [-90, 35]]] };

/** What each exit opens on, read from the brief rather than from the machine. */
const EXITS: readonly {
	readonly name: string;
	readonly event: DrawEvent;
	readonly mode: Mode['kind'];
	readonly vertices: readonly PlanarPosition[];
	/** Openers clear the highlight and closers keep it, which is the behaviour #1425 kept. */
	readonly highlighted: number | null;
	/** What a pending point request is told, when the exit leaves one. */
	readonly pending: DrawEffect;
}[] = [
	{
		// Escape is not a row of its own: the adapter sends it as this event, and
		// the useMapDraw suite presses the real key, over a draft and over a
		// pending point request.
		name: 'cancel',
		event: { type: 'cancel' },
		mode: 'idle',
		vertices: [],
		highlighted: 1,
		pending: { kind: 'rejectPoint', reason: 'cancelled' },
	},
	{
		name: 'commit',
		event: { type: 'commit', geometry: DRAW_TRIANGLE },
		mode: 'idle',
		vertices: [],
		highlighted: 1,
		pending: { kind: 'rejectPoint', reason: 'superseded' },
	},
	{
		name: 'start',
		event: { type: 'start', drawType: 'LineString' },
		mode: 'draw',
		vertices: [],
		highlighted: null,
		pending: { kind: 'rejectPoint', reason: 'superseded' },
	},
	{
		name: 'startPart',
		event: { type: 'startPart' },
		mode: 'draw',
		vertices: [],
		highlighted: null,
		pending: { kind: 'rejectPoint', reason: 'superseded' },
	},
	{
		name: 'startHole',
		event: { type: 'startHole', partIndex: 0 },
		mode: 'draw',
		vertices: [],
		highlighted: null,
		pending: { kind: 'rejectPoint', reason: 'superseded' },
	},
	{
		name: 'continuePart',
		event: { type: 'continuePart', partIndex: 0 },
		mode: 'draw',
		vertices: BLOCK,
		highlighted: null,
		pending: { kind: 'rejectPoint', reason: 'superseded' },
	},
	{
		name: 'editPart',
		event: { type: 'editPart', partIndex: 0 },
		mode: 'edit',
		vertices: [],
		highlighted: null,
		pending: { kind: 'rejectPoint', reason: 'superseded' },
	},
	{
		name: 'requestPoint',
		event: { type: 'requestPoint' },
		mode: 'point',
		vertices: [],
		highlighted: 1,
		pending: { kind: 'rejectPoint', reason: 'superseded' },
	},
];

describe('next', () => {
	describe.each(EXITS)('leaving by $name', ({ event, mode, vertices, highlighted, pending }) => {
		it('drops the cursor and the drag and seeds what the target opens with', () => {
			const { state } = next(OPEN_DRAFT, event, CONTEXT);

			expect(state.mode.kind).toBe(mode);
			expect(state.cursor).toBeNull();
			expect(state.drag).toBeNull();
			expect(state.vertices).toEqual(vertices);
			expect(state.highlighted).toBe(highlighted);
		});

		it('tells a pending point request why it ended', () => {
			const { state, effects } = next(PENDING_POINT, event, CONTEXT);

			expect(effects[0]).toEqual(pending);
			expect(state.cursor).toBeNull();
			expect(state.drag).toBeNull();
			expect(state.vertices).toEqual(vertices);
			expect(state.highlighted).toBe(highlighted);
		});
	});

	it('leaves a finished draft the way every other exit does, and reports the shape', () => {
		const { state, effects } = next(OPEN_DRAFT, { type: 'finish' }, CONTEXT);

		expect(state).toEqual({ ...IDLE_DRAW_STATE, highlighted: 1 });
		expect(effects).toEqual([{ kind: 'emit', geometry: DRAW_TRIANGLE }]);
	});

	it('leaves a pending point request alone on finish, which has nothing to finish', () => {
		const transition = next(PENDING_POINT, { type: 'finish' }, CONTEXT);

		expect(transition).toEqual({ state: PENDING_POINT, effects: [] });
	});

	it('resolves a pending point request on a click and keeps the highlight', () => {
		const { state, effects } = next(
			PENDING_POINT,
			{ type: 'click', position: [-90.7, 35.7] },
			CONTEXT,
		);

		expect(effects).toEqual([
			{ kind: 'resolvePoint', point: { type: 'Point', coordinates: [-90.7, 35.7] } },
		]);
		expect(state).toEqual({ ...IDLE_DRAW_STATE, highlighted: 1 });
	});

	// The other point click: one that finishes a point draft rather than answering
	// a request. A point draft has no request pending, so there is nothing to tell.
	it('leaves a point draft on its click the way every other exit does', () => {
		const pointDraft: DrawState = {
			...OPEN_DRAFT,
			mode: { kind: 'draw', type: 'Point', target: { kind: 'replace' } },
			vertices: [],
		};

		const { state, effects } = next(
			pointDraft,
			{ type: 'click', position: [-90.7, 35.7] },
			CONTEXT,
		);

		expect(state).toEqual({ ...IDLE_DRAW_STATE, highlighted: 1 });
		expect(effects).toEqual([
			{ kind: 'emit', geometry: { type: 'Point', coordinates: [-90.7, 35.7] } },
		]);
	});

	it('clears the committed shape when a fresh draw starts', () => {
		const { effects } = next(OPEN_DRAFT, { type: 'start', drawType: 'Polygon' }, CONTEXT);

		expect(effects).toEqual([{ kind: 'emit', geometry: null }]);
	});

	it('reports the geometry a commit adopts', () => {
		const { effects } = next(IDLE_DRAW_STATE, { type: 'commit', geometry: DRAW_TRIANGLE }, CONTEXT);

		expect(effects).toEqual([{ kind: 'emit', geometry: DRAW_TRIANGLE }]);
	});

	// The adapter re-renders only when one of these three changes, so a move that
	// handed back new objects for them would cost a render per frame.
	it('moves the rubber band without touching what a render reads', () => {
		const { state, effects } = next(OPEN_DRAFT, { type: 'move', position: [-88, 30] }, CONTEXT);

		expect(state.cursor).toEqual([-88, 30]);
		expect(state.mode).toBe(OPEN_DRAFT.mode);
		expect(state.vertices).toBe(OPEN_DRAFT.vertices);
		expect(effects).toEqual([]);
	});

	it('lands a dragged vertex as one Undo step and a click on it as none', () => {
		const opened = next(IDLE_DRAW_STATE, { type: 'editPart', partIndex: 0 }, CONTEXT).state;
		const grabbed = next(
			opened,
			{ type: 'grab', vertex: { ring: 0, vertex: 0 }, position: [-91, 34] },
			CONTEXT,
		).state;

		const clicked = next(grabbed, { type: 'release' }, CONTEXT).state;
		expect(clicked.drag).toBeNull();
		expect(clicked.mode).toMatchObject({ history: [] });

		const dragged = next(grabbed, { type: 'move', position: [-92, 33] }, CONTEXT).state;
		const dropped = next(dragged, { type: 'release' }, CONTEXT).state;
		expect(dropped.drag).toBeNull();
		expect(dropped.mode).toMatchObject({
			rings: [
				[
					[-92, 33],
					[-91, 37],
					[-88, 37],
					[-88, 34],
				],
			],
			history: [[BLOCK]],
		});
	});
});

/**
 * A run of the machine with each reported shape fed back in as the committed
 * value, which is what every form does with `onChange`. A part is added to
 * whatever the last report committed, so a run that pinned the value could not
 * see a second part at all.
 */
interface Run {
	readonly state: DrawState;
	readonly value: DrawGeometry | null;
	readonly geometryKind: OwnedGeometryKind;
	/** Every effect the run has produced, in order. */
	readonly effects: readonly DrawEffect[];
}

/** A habitat by default, which stores every shape, so nothing is refused for the record's sake. */
function begin(
	value: DrawGeometry | null = null,
	geometryKind: OwnedGeometryKind = 'habitat',
): Run {
	return { state: IDLE_DRAW_STATE, value, geometryKind, effects: [] };
}

function drive(run: Run, ...events: readonly DrawEvent[]): Run {
	let { state, value } = run;
	const effects = [...run.effects];
	for (const event of events) {
		const transition = next(state, event, { value, geometryKind: run.geometryKind });
		state = transition.state;
		for (const effect of transition.effects) {
			if (effect.kind === 'emit') {
				value = effect.geometry;
			}
			effects.push(effect);
		}
	}
	return { ...run, state, value, effects };
}

/** What the controller reports after the run. */
function view(run: Run) {
	return drawView(run.state, run.value);
}

/** Every geometry the run reported to `onChange`, in order. */
function emitted(run: Run): readonly (DrawGeometry | null)[] {
	return run.effects.flatMap((effect) => (effect.kind === 'emit' ? [effect.geometry] : []));
}

/** What the draft source holds after the run. */
function painted(run: Run): readonly GeoJSON.Feature[] {
	return buildFeatures({ committed: run.value, ...run.state }).features;
}

/** Roles carried by the painted features, in order. */
function roles(run: Run): (string | undefined)[] {
	return painted(run).map((feature) => feature.properties?.role ?? feature.geometry.type);
}

function closed(ring: readonly PlanarPosition[]): PlanarPosition[] {
	return [...ring, ring[0] as PlanarPosition];
}

/** Map clicks outside an edit, one per position. */
function clicks(positions: readonly PlanarPosition[]): DrawEvent[] {
	return positions.map((position) => ({ type: 'click', position }));
}

/** Map clicks during an edit, landing on nothing the draft painted. */
function traces(positions: readonly PlanarPosition[]): DrawEvent[] {
	return positions.map((position) => ({
		type: 'editClick',
		position,
		vertex: null,
		overEdge: false,
	}));
}

/** Place a ring's vertices and finish it, the way a user draws one. */
function drawPolygon(run: Run, ring: readonly PlanarPosition[]): Run {
	const opened = view(run).isDrawing ? run : drive(run, { type: 'start', drawType: 'Polygon' });
	return drive(opened, ...clicks(ring), FINISH);
}

/** Draw `first`, then add `second` as another piece. */
function drawTwo(
	run: Run,
	first: readonly PlanarPosition[],
	second: readonly PlanarPosition[],
): Run {
	return drawPolygon(drive(drawPolygon(run, first), { type: 'startPart' }), second);
}

/** Open the first piece, start a reshape, and trace `line` over it. */
function sketchOver(run: Run, line: readonly PlanarPosition[]): Run {
	return drive(run, { type: 'editPart', partIndex: 0 }, { type: 'startReshape' }, ...traces(line));
}

/** The same for Split. */
function splitOver(run: Run, line: readonly PlanarPosition[]): Run {
	return drive(run, { type: 'editPart', partIndex: 0 }, { type: 'startSplit' }, ...traces(line));
}

/**
 * Land the reshape line, then commit the piece. The reshaped outline is still a
 * draft the vertex gestures can work on, so the press that lands the line is
 * not the press that puts the piece back.
 */
function finishReshape(run: Run): Run {
	return drive(run, FINISH, FINISH);
}

/** A run with one point placed and committed. */
function pointPlaced(): Run {
	return drive(
		begin(),
		{ type: 'start', drawType: 'Point' },
		{ type: 'click', position: [-90, 35] },
	);
}

const FINISH: DrawEvent = { type: 'finish' };
const CANCEL: DrawEvent = { type: 'cancel' };
const UNDO: DrawEvent = { type: 'undo' };

const SECOND_SQUARE: readonly PlanarPosition[] = [
	[-80, 35],
	[-80, 36],
	[-79, 36],
];
/** Well inside {@link BLOCK}. */
const POND: readonly PlanarPosition[] = [
	[-90, 35],
	[-90, 36],
	[-89, 36],
	[-89, 35],
];
/** Two corners inside {@link BLOCK} and two outside its eastern edge. */
const ESCAPING_POND: readonly PlanarPosition[] = [
	[-89, 35],
	[-89, 36],
	[-85, 36],
	[-85, 35],
];
const HOLED_BLOCK: DrawGeometry = { type: 'Polygon', coordinates: [closed(BLOCK), closed(POND)] };

/**
 * A line crossing {@link BLOCK}'s northern edge twice, drawn north of it, and
 * the same line reflected about that edge. Outside the piece it pushes the edge
 * out to 38, inside it pulls the edge in to 36.
 */
const OUTSIDE_SKETCH: readonly PlanarPosition[] = [
	[-90.5, 36],
	[-90.5, 38],
	[-89.5, 38],
	[-89.5, 36],
];
const INSIDE_SKETCH: readonly PlanarPosition[] = [
	[-90.5, 38],
	[-90.5, 36],
	[-89.5, 36],
	[-89.5, 38],
];
/** {@link BLOCK} with {@link OUTSIDE_SKETCH} taken into its northern edge. */
const BULGED_BLOCK: readonly PlanarPosition[] = [
	[-90.5, 37],
	[-90.5, 38],
	[-89.5, 38],
	[-89.5, 37],
	[-88, 37],
	[-88, 34],
	[-91, 34],
	[-91, 37],
];
/** {@link BLOCK} with {@link INSIDE_SKETCH} taken into its northern edge. */
const NOTCHED_BLOCK: readonly PlanarPosition[] = [
	[-90.5, 37],
	[-90.5, 36],
	[-89.5, 36],
	[-89.5, 37],
	[-88, 37],
	[-88, 34],
	[-91, 34],
	[-91, 37],
];
/** A line straight down the middle of {@link BLOCK}, out both sides. */
const ACROSS_BLOCK: readonly PlanarPosition[] = [
	[-89.5, 33],
	[-89.5, 38],
];
/** The two halves {@link ACROSS_BLOCK} leaves, wound the way the block was. */
const WEST_HALF: readonly PlanarPosition[] = [
	[-89.5, 34],
	[-91, 34],
	[-91, 37],
	[-89.5, 37],
];
const EAST_HALF: readonly PlanarPosition[] = [
	[-89.5, 37],
	[-88, 37],
	[-88, 34],
	[-89.5, 34],
];
const STRAIGHT_LINE: DrawGeometry = {
	type: 'LineString',
	coordinates: [
		[-91, 35],
		[-90, 35],
		[-89, 35],
	],
};

/** Whether the run's paint marks anything refused, so a refusal is not only a greyed-out button. */
function paintsRefusal(run: Run): boolean {
	return painted(run).some((feature) => feature.properties?.refused === true);
}

describe('next, driven the way a form drives it', () => {
	describe('a draw', () => {
		it('finishes a point on the first click', () => {
			const started = drive(begin(), { type: 'start', drawType: 'Point' });
			expect(view(started).isDrawing).toBe(true);
			// Starting a draw clears whatever was committed before.
			expect(emitted(started)).toEqual([null]);

			const clicked = drive(started, { type: 'click', position: [-90.4, 35.4] });

			expect(emitted(clicked).at(-1)).toEqual({ type: 'Point', coordinates: [-90.4, 35.4] });
			expect(view(clicked).isDrawing).toBe(false);
		});

		it('collects vertices for a polygon and finishes into a closed ring', () => {
			const placed = drive(begin(), { type: 'start', drawType: 'Polygon' }, ...clicks(TRIANGLE));

			expect(view(placed).vertexCount).toBe(3);
			expect(view(placed).canFinish).toBe(true);
			// Three placed vertices already preview as the polygon they will become.
			expect(roles(placed)).toEqual(['Polygon', 'vertex', 'vertex', 'vertex']);

			expect(emitted(drive(placed, FINISH)).at(-1)).toEqual(DRAW_TRIANGLE);
		});

		it('undoes the last placed vertex', () => {
			const run = drive(
				begin(),
				{ type: 'start', drawType: 'Polygon' },
				...clicks([
					[-90, 35],
					[-90, 36],
				]),
				UNDO,
			);

			expect(view(run).vertexCount).toBe(1);
		});

		it('adopts a geometry obtained some other way', () => {
			const run = drive(
				begin(),
				{ type: 'start', drawType: 'Polygon' },
				{ type: 'commit', geometry: { type: 'Point', coordinates: [-90.9, 35.9] } },
			);

			expect(emitted(run).at(-1)).toEqual({ type: 'Point', coordinates: [-90.9, 35.9] });
			expect(view(run).isDrawing).toBe(false);
		});
	});

	describe('parts', () => {
		it('keeps a committed shape on the map while another piece is drawn', () => {
			const run = drive(
				drawPolygon(begin(), TRIANGLE),
				{ type: 'startPart' },
				...clicks(SECOND_SQUARE),
			);

			expect(roles(run)).toEqual([
				'Polygon',
				'vertex',
				'vertex',
				'vertex',
				'Polygon',
				'vertex',
				'vertex',
				'vertex',
			]);
		});

		it('promotes to a multi shape on the second piece and demotes on losing it', () => {
			const first = drawPolygon(begin(), TRIANGLE);
			expect(first.value?.type).toBe('Polygon');

			const adding = drive(first, { type: 'startPart' });
			expect(view(adding).isAddingPart).toBe(true);
			const second = drawPolygon(adding, SECOND_SQUARE);

			expect(second.value?.type).toBe('MultiPolygon');
			expect(drawParts(second.value)).toHaveLength(2);

			const removed = drive(second, { type: 'removePart', partIndex: 0 });

			expect(removed.value).toEqual({ type: 'Polygon', coordinates: [closed(SECOND_SQUARE)] });
		});

		it('leaves nothing behind when the last piece goes', () => {
			const run = drive(drawPolygon(begin(), TRIANGLE), { type: 'removePart', partIndex: 0 });

			expect(run.value).toBeNull();
			expect(drawParts(run.value)).toEqual([]);
		});

		it('adds a point piece on one click, the way a first point is placed', () => {
			const run = drive(
				pointPlaced(),
				{ type: 'startPart' },
				{ type: 'click', position: [-80, 36] },
			);

			expect(run.value).toEqual({
				type: 'MultiPoint',
				coordinates: [
					[-90, 35],
					[-80, 36],
				],
			});
			expect(view(run).isDrawing).toBe(false);
		});

		// "Redraw geometry" means the whole shape at any piece count, which is what
		// puts the piece list directly above the button that does it.
		it('takes every piece when the draw is a redraw', () => {
			const run = drive(drawTwo(begin(), TRIANGLE, SECOND_SQUARE), {
				type: 'start',
				drawType: 'Polygon',
			});

			expect(run.value).toBeNull();
			expect(drawParts(run.value)).toEqual([]);
		});

		// An Undo that reached back into a finished piece would eat work the user
		// cannot get back, so it pops inside the piece being drawn and stops at zero.
		it('undoes inside the piece being drawn and never into a finished one', () => {
			const run = drive(
				drawPolygon(begin(), TRIANGLE),
				{ type: 'startPart' },
				{ type: 'click', position: [-80, 35] },
				UNDO,
				UNDO,
			);

			expect(view(run).vertexCount).toBe(0);
			expect(drawParts(run.value)).toHaveLength(1);
		});

		it('picks out the highlighted piece for the map to paint', () => {
			const run = drive(drawTwo(begin(), TRIANGLE, SECOND_SQUARE), {
				type: 'highlightPart',
				partIndex: 1,
			});

			const shapes = painted(run).filter((feature) => feature.geometry.type === 'Polygon');
			expect(shapes.map((feature) => feature.properties?.highlighted)).toEqual([false, true]);
		});
	});

	// Every opener with nothing to open on leaves the control where it was rather
	// than opening an empty draft.
	describe.each<{
		readonly name: string;
		readonly from: () => Run;
		readonly event: DrawEvent;
		readonly draft?: 'holeDraft' | 'continuedPart' | 'editedPart';
	}>([
		{
			name: 'a piece before the first one is drawn',
			from: () => begin(),
			event: { type: 'startPart' },
		},
		{
			// The containment check would read a position pair as a ring and call
			// every vertex escaped, so this is refused in the machine rather than by
			// whichever button is hidden.
			name: 'a hole in a piece that is not an area',
			from: pointPlaced,
			event: { type: 'startHole', partIndex: 0 },
			draft: 'holeDraft',
		},
		{
			name: 'a hole in a piece that is not there',
			from: () => drawPolygon(begin(), BLOCK),
			event: { type: 'startHole', partIndex: 3 },
		},
		{
			// A point is one position. There is no end to pick up from.
			name: 'a continuation of a point',
			from: pointPlaced,
			event: { type: 'continuePart', partIndex: 0 },
			draft: 'continuedPart',
		},
		{
			name: 'a continuation of a piece that is not there',
			from: () => drawPolygon(begin(), TRIANGLE),
			event: { type: 'continuePart', partIndex: 4 },
		},
		{
			name: 'an edit of a piece that is not there',
			from: () => drawPolygon(begin(), TRIANGLE),
			event: { type: 'editPart', partIndex: 4 },
			draft: 'editedPart',
		},
	])('refusing $name', ({ from, event, draft }) => {
		it('opens nothing', () => {
			const run = drive(from(), event);

			expect(view(run).isDrawing).toBe(false);
			if (draft !== undefined) {
				expect(view(run)[draft]).toBeNull();
			}
		});
	});

	describe('a hole', () => {
		it('cuts a hole into the piece it was told to, as a second ring', () => {
			const opened = drive(drawPolygon(begin(), BLOCK), { type: 'startHole', partIndex: 0 });
			expect(view(opened).holeDraft).toEqual({ partNumber: 1, partCount: 1, problem: null });
			const placed = drive(opened, ...clicks(POND));
			expect(view(placed).canFinish).toBe(true);

			const run = drive(placed, FINISH);

			expect(run.value).toEqual(HOLED_BLOCK);
			// Still one piece: a hole is a ring of the piece, not another piece.
			expect(drawParts(run.value)).toHaveLength(1);
		});

		// The one validity rule the control buys, because the point-in-polygon test
		// already ships. Everything else a bad ring can be is #437.
		it('refuses to finish a hole that has left its piece', () => {
			const placed = drive(
				drawPolygon(begin(), BLOCK),
				{ type: 'startHole', partIndex: 0 },
				...clicks(ESCAPING_POND),
			);

			expect(view(placed).canFinish).toBe(false);
			expect(view(placed).holeDraft).toEqual({ partNumber: 1, partCount: 1, problem: 'escapes' });
			expect(drive(placed, FINISH).value).toEqual(COMMITTED);
		});

		// A vertex outside is enough, before there are three of them to close a ring,
		// so the draft is red while the pointer is still moving.
		it('paints a straying hole red from the first vertex outside', () => {
			const run = drive(
				drawPolygon(begin(), BLOCK),
				{ type: 'startHole', partIndex: 0 },
				{ type: 'click', position: [-70, 35.5] },
			);

			expect(view(run).holeDraft?.problem).toBe('escapes');
			const drafts = painted(run).filter(
				(feature) => feature.properties?.role === 'vertex' && feature.properties?.refused,
			);
			expect(drafts).toHaveLength(1);
		});

		// A hole drawn to the piece's own boundary leaves a polygon covering no
		// ground, which the server answers 400, so Finish has to refuse it here.
		it('refuses a hole that takes the whole piece', () => {
			const run = drive(
				drawPolygon(begin(), BLOCK),
				{ type: 'startHole', partIndex: 0 },
				...clicks(BLOCK),
			);

			expect(view(run).holeDraft?.problem).toBe('swallows');
			expect(view(run).canFinish).toBe(false);
		});

		it('cuts into the piece the row names, not the first one', () => {
			const opened = drive(drawTwo(begin(), TRIANGLE, BLOCK), { type: 'startHole', partIndex: 1 });
			expect(view(opened).holeDraft?.partNumber).toBe(2);

			const run = drive(opened, ...clicks(POND), FINISH);

			expect(run.value).toEqual({
				type: 'MultiPolygon',
				coordinates: [[closed(TRIANGLE)], [closed(BLOCK), closed(POND)]],
			});
		});

		it('drops one hole and leaves the piece alone', () => {
			const run = drive(
				drawPolygon(begin(), BLOCK),
				{ type: 'startHole', partIndex: 0 },
				...clicks(POND),
				FINISH,
				{ type: 'removeHole', partIndex: 0, holeIndex: 0 },
			);

			expect(run.value).toEqual(COMMITTED);
		});
	});

	describe('a continuation', () => {
		it('adds to a finished area and keeps the vertices it already had', () => {
			const opened = drive(drawPolygon(begin(), TRIANGLE), { type: 'continuePart', partIndex: 0 });
			expect(view(opened).vertexCount).toBe(3);

			const run = drive(opened, { type: 'click', position: [-89, 35] }, FINISH);

			expect(run.value).toEqual({
				type: 'Polygon',
				coordinates: [closed([...TRIANGLE, [-89, 35]])],
			});
		});

		// #472: the form reads any report as a redraw, and on a habitat that names
		// `updateHabitatLocation`, which a collector may not send. A finish that
		// placed no corner has nothing to report.
		it('reports nothing when a continuation finishes on the corners it opened with', () => {
			const opened = drive(begin(DRAW_TRIANGLE), { type: 'continuePart', partIndex: 0 });
			expect(view(opened).vertexCount).toBe(3);

			const run = drive(opened, FINISH);

			expect(emitted(run)).toEqual([]);
			expect(view(run).isDrawing).toBe(false);
			expect(view(run).vertexCount).toBe(0);
		});

		// The guard is on the commit rather than on the continuation, so every gesture
		// that puts a piece back reads it. An edit opened and finished with nothing
		// moved is the same shape arriving by the path reshape and split land on.
		it('reports nothing when an edit finishes on the piece it opened', () => {
			const run = drive(begin(COMMITTED), { type: 'editPart', partIndex: 0 }, FINISH);

			expect(emitted(run)).toEqual([]);
			expect(view(run).isDrawing).toBe(false);
		});

		// A ring adopted from a file or a region is only closed if whoever wrote it
		// closed it, and slicing one that is not would lose a corner.
		it('keeps every corner of an unclosed ring it continues', () => {
			const run = drive(begin({ type: 'Polygon', coordinates: [[...TRIANGLE]] }), {
				type: 'continuePart',
				partIndex: 0,
			});

			expect(view(run).vertexCount).toBe(3);
		});

		it('adds to a finished line at its end', () => {
			const run = drive(
				begin(),
				{ type: 'start', drawType: 'LineString' },
				...clicks([
					[-90, 35],
					[-90, 36],
				]),
				FINISH,
				{ type: 'continuePart', partIndex: 0 },
				{ type: 'click', position: [-89, 36] },
				FINISH,
			);

			expect(run.value).toEqual({
				type: 'LineString',
				coordinates: [
					[-90, 35],
					[-90, 36],
					[-89, 36],
				],
			});
		});

		it('leaves the other pieces alone while one is continued', () => {
			const opened = drive(drawTwo(begin(), TRIANGLE, SECOND_SQUARE), {
				type: 'continuePart',
				partIndex: 1,
			});
			expect(view(opened).continuedPart).toEqual({ partNumber: 2, partCount: 2, problem: null });

			const run = drive(opened, { type: 'click', position: [-79, 35] }, FINISH);

			expect(run.value).toEqual({
				type: 'MultiPolygon',
				coordinates: [[closed(TRIANGLE)], [closed([...SECOND_SQUARE, [-79, 35]])]],
			});
		});

		// The piece being continued is the draft, so drawing it twice would put a
		// finished outline under a growing one.
		it('draws the piece being continued once, as the draft', () => {
			const run = drive(drawTwo(begin(), TRIANGLE, SECOND_SQUARE), {
				type: 'continuePart',
				partIndex: 0,
			});

			expect(painted(run).filter((feature) => feature.geometry.type === 'Polygon')).toHaveLength(2);
		});

		// Undo pops what the continuation added and stops there. Eating into the
		// piece's own vertices would take back work the user never asked to undo.
		it('undoes only the vertices a continuation added', () => {
			const opened = drive(drawPolygon(begin(), TRIANGLE), { type: 'continuePart', partIndex: 0 });
			expect(view(opened).canUndo).toBe(false);
			const placed = drive(opened, { type: 'click', position: [-89, 35] });
			expect(view(placed).canUndo).toBe(true);

			const once = drive(placed, UNDO);
			expect(view(once).vertexCount).toBe(3);
			expect(view(once).canUndo).toBe(false);

			expect(view(drive(once, UNDO)).vertexCount).toBe(3);
		});

		it('keeps the holes already cut into the piece it continues', () => {
			const holed = drive(
				drawPolygon(begin(), BLOCK),
				{ type: 'startHole', partIndex: 0 },
				...clicks(POND),
				FINISH,
			);
			const opened = drive(holed, { type: 'continuePart', partIndex: 0 });
			// The outline's vertices only. A hole is its own ring and is not being
			// redrawn.
			expect(view(opened).vertexCount).toBe(4);

			const run = drive(opened, { type: 'click', position: [-88, 33] }, FINISH);

			expect(run.value).toEqual({
				type: 'Polygon',
				coordinates: [closed([...BLOCK, [-88, 33]]), closed(POND)],
			});
		});

		// Appending a vertex can carve the outline inward, and a hole left outside it
		// is a polygon PostGIS calls invalid.
		it('refuses to finish a continuation that has pushed a hole outside', () => {
			const holed = drive(
				drawPolygon(begin(), BLOCK),
				{ type: 'startHole', partIndex: 0 },
				...clicks(POND),
				FINISH,
			);
			const run = drive(
				holed,
				{ type: 'continuePart', partIndex: 0 },
				{ type: 'click', position: [-89.5, 36.5] },
			);

			expect(view(run).canFinish).toBe(false);
			expect(view(run).continuedPart?.problem).toBe('holesEscape');
			expect(paintsRefusal(run)).toBe(true);
			expect(drive(run, FINISH).value).toEqual(HOLED_BLOCK);
		});

		// The piece being continued is hidden and redrawn as the draft, so its holes
		// have to come with it, corners and all.
		it('keeps a hole and its corners on the map through a continuation', () => {
			const run = drive(begin(HOLED_BLOCK), { type: 'continuePart', partIndex: 0 });

			expect(roles(run)).toEqual(['Polygon', ...Array.from({ length: 8 }, () => 'vertex')]);
		});

		it('renders the corners of a hole as vertices of its piece', () => {
			expect(roles(begin(HOLED_BLOCK))).toEqual([
				'Polygon',
				...Array.from({ length: 8 }, () => 'vertex'),
			]);
		});
	});

	// Every way out of a draft that puts the committed shape back as it was. Each
	// row's draft has already changed the piece by the time it is abandoned.
	describe.each<{
		readonly name: string;
		readonly open: () => Run;
		readonly committed: DrawGeometry;
	}>([
		{
			name: 'a continuation',
			open: () =>
				drive(
					drawPolygon(begin(), TRIANGLE),
					{ type: 'continuePart', partIndex: 0 },
					{ type: 'click', position: [-89, 35] },
				),
			committed: DRAW_TRIANGLE,
		},
		{
			name: 'an edit, holes included',
			open: () =>
				drive(
					drawPolygon(
						drive(drawPolygon(begin(), BLOCK), { type: 'startHole', partIndex: 0 }),
						POND,
					),
					{ type: 'editPart', partIndex: 0 },
					{ type: 'moveVertex', vertex: { ring: 1, vertex: 0 }, position: [-89.5, 35.5] },
				),
			committed: HOLED_BLOCK,
		},
		{
			name: 'a reshape',
			open: () => sketchOver(drawPolygon(begin(), BLOCK), OUTSIDE_SKETCH),
			committed: COMMITTED,
		},
		{
			name: 'a split',
			open: () => splitOver(drawPolygon(begin(), BLOCK), ACROSS_BLOCK),
			committed: COMMITTED,
		},
	])('cancelling $name', ({ open, committed }) => {
		it('puts the piece back as it was', () => {
			const run = drive(open(), CANCEL);

			expect(run.value).toEqual(committed);
			expect(view(run).isDrawing).toBe(false);
			expect(view(run).editedPart).toBeNull();
		});
	});

	describe('an edit', () => {
		it('moves a vertex of a finished piece and commits it where it was dropped', () => {
			const run = drive(
				drawPolygon(begin(), TRIANGLE),
				{ type: 'editPart', partIndex: 0 },
				{ type: 'moveVertex', vertex: { ring: 0, vertex: 2 }, position: [-88, 36] },
				FINISH,
			);

			expect(run.value).toEqual({
				type: 'Polygon',
				coordinates: [
					closed([
						[-90, 35],
						[-90, 36],
						[-88, 36],
					]),
				],
			});
		});

		// Between the edge's two ends, not at the end of the ring. Appending would
		// leave the same corners wound into a different shape.
		it('inserts a vertex into the edge it was aimed at', () => {
			const inserted = drive(
				drawPolygon(begin(), TRIANGLE),
				{ type: 'editPart', partIndex: 0 },
				{ type: 'insertVertex', edge: { ring: 0, vertex: 0 }, position: [-90, 35.5] },
			);
			// The new corner is the one Delete acts on, so clicking an edge and pressing
			// Delete takes back exactly what it added.
			expect(view(inserted).editedPart?.selected).toEqual({ ring: 0, vertex: 1 });

			expect(drive(inserted, FINISH).value).toEqual({
				type: 'Polygon',
				coordinates: [
					closed([
						[-90, 35],
						[-90, 35.5],
						[-90, 36],
						[-89, 36],
					]),
				],
			});
		});

		it('lets a ring go below three corners and refuses the finish until one is back', () => {
			const deleted = drive(
				drawPolygon(begin(), TRIANGLE),
				{ type: 'editPart', partIndex: 0 },
				{ type: 'deleteVertex', vertex: { ring: 0, vertex: 2 } },
			);

			expect(view(deleted).canFinish).toBe(false);
			expect(view(deleted).editedPart?.problem).toBe('tooFewVertices');
			expect(paintsRefusal(deleted)).toBe(true);

			const restored = drive(deleted, {
				type: 'insertVertex',
				edge: { ring: 0, vertex: 1 },
				position: [-89, 36],
			});
			expect(view(restored).canFinish).toBe(true);
			expect(view(restored).editedPart?.problem).toBeNull();
		});

		// An edge is the only way to put a vertex back, and a ring of one has none, so
		// two is where Delete stops. Removing a ring whole is Remove's job.
		it('keeps the two vertices an edge needs', () => {
			const run = drive(
				drawPolygon(begin(), TRIANGLE),
				{ type: 'editPart', partIndex: 0 },
				{ type: 'deleteVertex', vertex: { ring: 0, vertex: 2 } },
				{ type: 'deleteVertex', vertex: { ring: 0, vertex: 1 } },
			);

			expect(view(run).vertexCount).toBe(2);
			// The refused Delete recorded nothing, so one Undo is back to three.
			const undone = drive(run, UNDO);
			expect(view(undone).vertexCount).toBe(3);
			expect(view(undone).canUndo).toBe(false);
		});

		it('edits a hole ring with the same three gestures as the outline', () => {
			const run = drive(
				begin(HOLED_BLOCK),
				{ type: 'editPart', partIndex: 0 },
				{ type: 'moveVertex', vertex: { ring: 1, vertex: 0 }, position: [-90.5, 35] },
				{ type: 'insertVertex', edge: { ring: 1, vertex: 2 }, position: [-89, 35.5] },
				{ type: 'deleteVertex', vertex: { ring: 1, vertex: 4 } },
				FINISH,
			);

			expect(run.value).toEqual({
				type: 'Polygon',
				coordinates: [
					closed(BLOCK),
					closed([
						[-90.5, 35],
						[-90, 36],
						[-89, 36],
						[-89, 35.5],
					]),
				],
			});
		});

		// The same rule the continuation path reports, read from the other end: an
		// outline pulled in past a hole is a polygon PostGIS calls invalid.
		it('refuses an edit that has pushed a hole outside the outline', () => {
			const run = drive(
				begin(HOLED_BLOCK),
				{ type: 'editPart', partIndex: 0 },
				{ type: 'moveVertex', vertex: { ring: 0, vertex: 2 }, position: [-89.5, 36.5] },
			);

			expect(view(run).canFinish).toBe(false);
			expect(view(run).editedPart?.problem).toBe('holesEscape');
			expect(drive(run, FINISH).value).toEqual(HOLED_BLOCK);
		});

		it('leaves the other pieces alone and keeps the edited one at its index', () => {
			const opened = drive(drawTwo(begin(), TRIANGLE, SECOND_SQUARE), {
				type: 'editPart',
				partIndex: 0,
			});
			expect(view(opened).editedPart).toEqual({
				partNumber: 1,
				partCount: 2,
				problem: null,
				selected: null,
				sketch: null,
			});

			const run = drive(
				opened,
				{ type: 'moveVertex', vertex: { ring: 0, vertex: 0 }, position: [-91, 35] },
				FINISH,
			);

			expect(run.value).toEqual({
				type: 'MultiPolygon',
				coordinates: [
					[
						closed([
							[-91, 35],
							[-90, 36],
							[-89, 36],
						]),
					],
					[closed(SECOND_SQUARE)],
				],
			});
		});

		// The piece being edited is the draft, so drawing it twice would put a
		// finished outline under a changing one.
		it('draws the piece being edited once, as the draft', () => {
			const run = drive(drawTwo(begin(), TRIANGLE, SECOND_SQUARE), {
				type: 'editPart',
				partIndex: 0,
			});

			expect(painted(run).filter((feature) => feature.geometry.type === 'Polygon')).toHaveLength(2);
		});

		// A point has no end to carry on from, which is why Continue skips it, and one
		// corner to pick up, which is why this does not.
		it('moves the position of a point piece', () => {
			const opened = drive(pointPlaced(), { type: 'editPart', partIndex: 0 });
			expect(view(opened).isDrawing).toBe(true);

			const run = drive(
				opened,
				{ type: 'moveVertex', vertex: { ring: 0, vertex: 0 }, position: [-89, 34] },
				FINISH,
			);

			expect(run.value).toEqual({ type: 'Point', coordinates: [-89, 34] });
		});

		// Undo takes back gestures and stops at the piece as it was opened. Eating
		// into it would take back work the user never asked to undo.
		it('undoes only the gestures an edit made', () => {
			const opened = drive(drawPolygon(begin(), TRIANGLE), { type: 'editPart', partIndex: 0 });
			expect(view(opened).canUndo).toBe(false);

			const moved = drive(
				opened,
				{ type: 'moveVertex', vertex: { ring: 0, vertex: 0 }, position: [-91, 35] },
				{ type: 'insertVertex', edge: { ring: 0, vertex: 0 }, position: [-90.5, 35.5] },
			);
			expect(view(moved).canUndo).toBe(true);

			const undone = drive(moved, UNDO, UNDO);
			expect(view(undone).canUndo).toBe(false);

			expect(drive(undone, UNDO, FINISH).value).toEqual(DRAW_TRIANGLE);
		});

		it('picks the vertex Delete acts on and drops the pick with it', () => {
			const picked = drive(
				drawPolygon(begin(), TRIANGLE),
				{ type: 'editPart', partIndex: 0 },
				{ type: 'selectVertex', vertex: { ring: 0, vertex: 1 } },
			);
			expect(view(picked).editedPart?.selected).toEqual({ ring: 0, vertex: 1 });

			const run = drive(picked, { type: 'deleteVertex', vertex: { ring: 0, vertex: 1 } });
			expect(view(run).editedPart?.selected).toBeNull();
			expect(view(run).vertexCount).toBe(2);
		});

		// Three corners on one line are three corners and no area. #495 refused it
		// with nothing to call it; the reshape vocabulary gave the refusal a name, so
		// the message under the button and the red on the map are one answer.
		it('names an edit that leaves the outline enclosing nothing', () => {
			const run = drive(
				drawPolygon(begin(), TRIANGLE),
				{ type: 'editPart', partIndex: 0 },
				{ type: 'moveVertex', vertex: { ring: 0, vertex: 2 }, position: [-90, 37] },
			);

			expect(view(run).editedPart?.problem).toBe('coversNoGround');
			expect(view(run).canFinish).toBe(false);
		});
	});

	describe('a reshape', () => {
		it('extends a piece when the reshape line runs outside it', () => {
			const run = finishReshape(sketchOver(drawPolygon(begin(), BLOCK), OUTSIDE_SKETCH));

			expect(run.value).toEqual({ type: 'Polygon', coordinates: [closed(BULGED_BLOCK)] });
		});

		// The same line reflected about the edge it crosses. Nothing in the gesture
		// says which of the two is meant: where the line runs is the whole answer.
		it('carves a piece away when the reshape line runs inside it', () => {
			const run = finishReshape(sketchOver(drawPolygon(begin(), BLOCK), INSIDE_SKETCH));

			expect(run.value).toEqual({ type: 'Polygon', coordinates: [closed(NOTCHED_BLOCK)] });
		});

		// The line leaves the piece at -89.5 and comes back, so there are three
		// crossings. A rule stopping at the second would drop the last third of it.
		it('replaces the stretch between the first and last of several crossings', () => {
			const run = finishReshape(
				sketchOver(drawPolygon(begin(), BLOCK), [
					[-90.5, 38],
					[-90.5, 36],
					[-90, 36],
					[-90, 38],
					[-89.5, 38],
					[-89.5, 36],
				]),
			);

			expect(run.value).toEqual({
				type: 'Polygon',
				coordinates: [
					closed([
						[-90.5, 37],
						[-90.5, 36],
						[-90, 36],
						[-90, 38],
						[-89.5, 38],
						[-89.5, 37],
						[-88, 37],
						[-88, 34],
						[-91, 34],
						[-91, 37],
					]),
				],
			});
		});

		it('refuses a line that does not cross the edge twice', () => {
			const run = sketchOver(drawPolygon(begin(), BLOCK), [
				[-90.5, 35],
				[-89.5, 35],
			]);

			expect(view(run).editedPart?.problem).toBe('tooFewCrossings');
			expect(view(run).canFinish).toBe(false);
			expect(paintsRefusal(run)).toBe(true);
			expect(drive(run, FINISH).value).toEqual(COMMITTED);
		});

		// A line that has not crossed anything yet is a draw in progress, the way one
		// vertex of a polygon is, so it must not paint the piece red.
		it('says nothing is wrong until the line has two vertices', () => {
			const run = sketchOver(drawPolygon(begin(), BLOCK), []);

			expect(view(run).editedPart?.sketch?.vertices ?? null).toBe(0);
			expect(view(run).editedPart?.problem).toBeNull();
			expect(view(run).canFinish).toBe(false);
		});

		it('carries the holes of the piece it reshapes through untouched', () => {
			const run = finishReshape(sketchOver(begin(HOLED_BLOCK), OUTSIDE_SKETCH));

			expect(run.value).toEqual({
				type: 'Polygon',
				coordinates: [closed(BULGED_BLOCK), closed(POND)],
			});
		});

		// The same refusal a hole cut outside its piece reports, read from the other
		// end: here the outline moved rather than the hole.
		it('refuses a reshape that leaves a hole outside the piece', () => {
			const run = sketchOver(begin(HOLED_BLOCK), [
				[-92, 34.5],
				[-89.5, 34.5],
				[-89.5, 36.5],
				[-92, 36.5],
			]);

			expect(view(run).editedPart?.problem).toBe('holesEscape');
			expect(view(run).canFinish).toBe(false);
		});

		it('replaces the stretch of a line between its two crossings', () => {
			const run = finishReshape(
				sketchOver(begin(STRAIGHT_LINE), [
					[-90.5, 34],
					[-90.5, 36],
					[-89.5, 36],
					[-89.5, 34],
				]),
			);

			expect(run.value).toEqual({
				type: 'LineString',
				coordinates: [
					[-91, 35],
					[-90.5, 35],
					[-90.5, 36],
					[-89.5, 36],
					[-89.5, 35],
					[-89, 35],
				],
			});
		});

		// A point has one corner and no boundary a line could cross.
		it('has nothing to reshape on a point', () => {
			const run = drive(
				pointPlaced(),
				{ type: 'editPart', partIndex: 0 },
				{ type: 'startReshape' },
			);

			expect(view(run).editedPart?.sketch?.vertices ?? null).toBeNull();
		});

		it('leaves the other pieces alone and keeps the reshaped one at its index', () => {
			const opened = drive(drawTwo(begin(), TRIANGLE, BLOCK), { type: 'editPart', partIndex: 1 });
			expect(view(opened).editedPart?.partNumber).toBe(2);

			const run = finishReshape(drive(opened, { type: 'startReshape' }, ...traces(OUTSIDE_SKETCH)));

			expect(run.value).toEqual({
				type: 'MultiPolygon',
				coordinates: [[closed(TRIANGLE)], [closed(BULGED_BLOCK)]],
			});
		});

		// Undo unwinds the line one vertex at a time and closes an empty one, so a
		// sketch nobody wanted does not cost the whole edit.
		it('undoes a reshape line vertex by vertex and then closes it', () => {
			const sketched = sketchOver(drawPolygon(begin(), BLOCK), OUTSIDE_SKETCH);
			expect(view(sketched).editedPart?.sketch?.vertices ?? null).toBe(4);

			const emptied = drive(sketched, UNDO, UNDO, UNDO, UNDO);
			expect(view(emptied).editedPart?.sketch?.vertices ?? null).toBe(0);
			expect(view(emptied).canUndo).toBe(true);

			const shut = drive(emptied, UNDO);
			expect(view(shut).editedPart?.sketch?.vertices ?? null).toBeNull();
			expect(view(shut).canUndo).toBe(false);
		});

		// A landed reshape is one gesture, the way a moved vertex is, so Undo takes it
		// back whole and stops at the piece as it was opened.
		it('takes a landed reshape back in one step', () => {
			const landed = drive(sketchOver(drawPolygon(begin(), BLOCK), OUTSIDE_SKETCH), FINISH);
			expect(view(landed).editedPart?.sketch?.vertices ?? null).toBeNull();

			const undone = drive(landed, UNDO);
			expect(view(undone).canUndo).toBe(false);

			expect(drive(undone, FINISH).value).toEqual(COMMITTED);
		});

		// A line drawn out of the piece and straight back over itself replaces the
		// whole stretch with a line, which is an outline of two corners. Refused by
		// the same rule that refuses a vertex deleted below the minimum.
		it('refuses a reshape that folds the outline back on itself', () => {
			const run = sketchOver(drawPolygon(begin(), BLOCK), [
				[-90, 33],
				[-90, 38],
				[-90, 33],
			]);

			expect(view(run).editedPart?.problem).toBe('tooFewVertices');
			expect(view(run).canFinish).toBe(false);
			expect(drive(run, FINISH).value).toEqual(COMMITTED);
		});
	});

	describe('a split', () => {
		// Half the block each way, from one line drawn clean across it. Both halves
		// keep the winding the block arrived with, so neither is flipped on the way
		// into the part list.
		it('cuts a piece in two along the split line', () => {
			const run = drive(splitOver(drawPolygon(begin(), BLOCK), ACROSS_BLOCK), FINISH);

			expect(run.value).toEqual({
				type: 'MultiPolygon',
				coordinates: [[closed(WEST_HALF)], [closed(EAST_HALF)]],
			});
		});

		it('gives a hole the line misses to the piece that holds it', () => {
			const run = drive(
				splitOver(begin(HOLED_BLOCK), [
					[-88.5, 33],
					[-88.5, 38],
				]),
				FINISH,
			);

			expect(run.value).toEqual({
				type: 'MultiPolygon',
				coordinates: [
					[
						closed([
							[-88.5, 34],
							[-91, 34],
							[-91, 37],
							[-88.5, 37],
						]),
						closed(POND),
					],
					[
						closed([
							[-88.5, 37],
							[-88, 37],
							[-88, 34],
							[-88.5, 34],
						]),
					],
				],
			});
		});

		// The pond straddles the line, so it stops being a hole: each half of its ring
		// becomes part of the outline of one piece. The coordinates are pinned in the
		// corpus in `packages/mapping`; what this owns is that the shape reported is a
		// two-piece MultiPolygon with no hole left anywhere in it.
		it('turns a hole the line crosses into the boundary of both pieces', () => {
			const run = drive(splitOver(begin(HOLED_BLOCK), ACROSS_BLOCK), FINISH);

			const parts = drawParts(run.value);
			expect(parts).toHaveLength(2);
			expect(parts.map(drawHoles)).toEqual([[], []]);
			expect(run.value?.type).toBe('MultiPolygon');
		});

		it('cuts a line in two at the place the split line crosses it', () => {
			const run = drive(
				splitOver(begin(STRAIGHT_LINE), [
					[-89.5, 34],
					[-89.5, 36],
				]),
				FINISH,
			);

			expect(run.value).toEqual({
				type: 'MultiLineString',
				coordinates: [
					[
						[-91, 35],
						[-90, 35],
						[-89.5, 35],
					],
					[
						[-89.5, 35],
						[-89, 35],
					],
				],
			});
		});

		// The two halves go in where the piece they replace was, so the piece drawn
		// second stays last in the list rather than being pushed around by the cut.
		it('leaves the other pieces alone and puts both halves at the index it split', () => {
			const run = drive(splitOver(drawTwo(begin(), BLOCK, SECOND_SQUARE), ACROSS_BLOCK), FINISH);

			expect(run.value).toEqual({
				type: 'MultiPolygon',
				coordinates: [[closed(WEST_HALF)], [closed(EAST_HALF)], [closed(SECOND_SQUARE)]],
			});
		});

		it('says nothing is wrong until the split line has two vertices', () => {
			const run = splitOver(drawPolygon(begin(), BLOCK), []);

			expect(view(run).editedPart?.sketch).toEqual({ tool: 'split', vertices: 0 });
			expect(view(run).editedPart?.problem).toBeNull();
			expect(view(run).canFinish).toBe(false);
		});

		// A line that stops inside leaves one piece with a slit down it, which is not
		// a cut and is not something the part list could hold.
		it('refuses a split line that does not come out the other side', () => {
			const run = splitOver(drawPolygon(begin(), BLOCK), [
				[-89.5, 33],
				[-89.5, 35],
			]);

			expect(view(run).editedPart?.problem).toBe('doesNotDivide');
			expect(view(run).canFinish).toBe(false);
			expect(drive(run, FINISH).value).toEqual(COMMITTED);
		});

		// A Notification Registration stores a Point or a Polygon and neither multi
		// shape, so the second half of a cut has nowhere to go. Read off
		// `OWNED_GEOMETRY_POLICIES` rather than named here, and refused before the
		// first click because no line will make it false.
		it('refuses a split on a record that cannot store a second piece', () => {
			const run = splitOver(
				drawPolygon(begin(null, 'notificationRegistration'), BLOCK),
				ACROSS_BLOCK,
			);

			expect(view(run).editedPart?.problem).toBe('cannotHoldParts');
			expect(view(run).canFinish).toBe(false);
			expect(drive(run, FINISH).value).toEqual(COMMITTED);
		});
	});
});

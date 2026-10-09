import type { PlanarPosition } from '@simmer-mosquito/mapping';
import { describe, expect, it } from 'vitest';
import {
	type DrawContext,
	type DrawEffect,
	type DrawEvent,
	type DrawState,
	IDLE_DRAW_STATE,
	next,
} from '../../../../components/map/draw-machine';
import type { DrawGeometry, Mode } from '../../../../components/map/draw-parts';

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

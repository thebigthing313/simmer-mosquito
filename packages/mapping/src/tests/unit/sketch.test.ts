import { describe, expect, it } from 'vitest';
import type { PlanarPath, SplitPart } from '../../sketch.js';
import { reshapePath, sketchCrossings, splitRings } from '../../sketch.js';

/**
 * The reshape and split corpus: a sketch, the path it was drawn across, and the
 * path or the pieces it leaves.
 *
 * Every expectation is hand-written and checked by hand. `packages/mapping`
 * takes no geometry library, so there is no oracle to generate one from, and a
 * corpus generated from the code under test would only confirm the code agrees
 * with itself.
 *
 * One square, wound clockwise from the origin, at plain magnitudes. The region
 * membership corpus sits at realistic WGS84 longitudes because floating-point
 * behaviour near the boundary is the thing it pins down. Nothing here turns on
 * that: every crossing below is an axis-aligned segment meeting an axis-aligned
 * edge, so each one is exact at any magnitude and small numbers make the
 * expectations readable.
 */
const SQUARE: PlanarPath = [
	[0, 0],
	[0, 10],
	[10, 10],
	[10, 0],
];

/** {@link SQUARE}'s corners in the opposite order, so the same ring wound back. */
const SQUARE_BACKWARDS: PlanarPath = [...SQUARE].reverse();

/** A straight line running east along the equator, with a corner to lose. */
const LINE: PlanarPath = [
	[0, 0],
	[5, 0],
	[10, 0],
];

/** A line crossing {@link SQUARE}'s northern edge twice, bulging north of it. */
const BULGE: PlanarPath = [
	[2, 9],
	[2, 12],
	[8, 12],
	[8, 9],
];

function reshaped(path: PlanarPath, sketch: PlanarPath, closed = true): PlanarPath | string {
	const outcome = reshapePath({ path, sketch, closed });
	return outcome.kind === 'reshaped' ? outcome.path : outcome.refusal;
}

/**
 * Twice the area a ring encloses, signed, which is what carries its winding.
 *
 * Read for its sign alone. A ring's direction is not something the expected
 * coordinates say out loud, and it is the half of the answer a consumer that
 * re-reads the ring depends on.
 */
function windingOf(ring: PlanarPath): number {
	let total = 0;
	for (let index = 0; index < ring.length; index += 1) {
		const at = ring[index] ?? [0, 0];
		const next = ring[(index + 1) % ring.length] ?? [0, 0];
		total += at[0] * next[1] - next[0] * at[1];
	}
	return Math.sign(total);
}

describe('reshapePath', () => {
	/**
	 * The two directions the tool covers, from one sketch drawn either side of the
	 * edge it crosses. Reflecting it about the top edge is the whole difference:
	 * outside the square it bulges the boundary out to y=12, inside it pulls the
	 * boundary in to y=8. Nothing in the call says which is meant.
	 */
	it('extends the shape when the sketch runs outside it', () => {
		expect(reshaped(SQUARE, BULGE)).toEqual([
			[2, 10],
			[2, 12],
			[8, 12],
			[8, 10],
			[10, 10],
			[10, 0],
			[0, 0],
			[0, 10],
		]);
	});

	it('carves the shape away when the same sketch runs inside it', () => {
		expect(
			reshaped(SQUARE, [
				[2, 11],
				[2, 8],
				[8, 8],
				[8, 11],
			]),
		).toEqual([
			[2, 10],
			[2, 8],
			[8, 8],
			[8, 10],
			[10, 10],
			[10, 0],
			[0, 0],
			[0, 10],
		]);
	});

	/**
	 * Three crossings, and the one in the middle is passed over. The sketch leaves
	 * the square at x=5 and comes back, so a rule reading crossings in pairs would
	 * make two stretches out of this and a rule stopping at the second would drop
	 * the last third of the sketch.
	 */
	it('replaces the stretch between the first and last of several crossings', () => {
		expect(
			reshaped(SQUARE, [
				[2, 12],
				[2, 8],
				[5, 8],
				[5, 12],
				[8, 12],
				[8, 8],
			]),
		).toEqual([
			[2, 10],
			[2, 8],
			[5, 8],
			[5, 12],
			[8, 12],
			[8, 10],
			[10, 10],
			[10, 0],
			[0, 0],
			[0, 10],
		]);
	});

	/**
	 * A sketch straight across a ring leaves two pieces of the same shape and
	 * nothing in the geometry says which the user wanted. The larger one is kept,
	 * so the small strip below y=2 goes. Cutting away the larger side is Split's
	 * gesture, and it is #497 rather than a second mode here.
	 */
	it('keeps the larger side when a sketch runs clean across', () => {
		expect(
			reshaped(SQUARE, [
				[-1, 2],
				[11, 2],
			]),
		).toEqual([
			[0, 2],
			[0, 10],
			[10, 10],
			[10, 2],
		]);
	});

	/**
	 * The crossings in between are passed over, and the first and last land on
	 * different edges, so the stretch replaced wraps two corners rather than
	 * sitting on one edge the way every case above it does.
	 */
	it('replaces the stretch between crossings on different edges', () => {
		expect(
			reshaped(SQUARE, [
				[-1, 5],
				[3, 5],
				[3, 12],
				[7, 12],
				[7, 5],
				[11, 5],
			]),
		).toEqual([
			[0, 5],
			[3, 5],
			[3, 12],
			[7, 12],
			[7, 5],
			[10, 5],
			[10, 0],
			[0, 0],
		]);
	});

	/**
	 * A crossing landing exactly on a corner is found by both edges that meet
	 * there. Kept twice it would put that corner in the result as its own
	 * zero-length edge, and here it is both crossings at once.
	 */
	it('takes a crossing that lands on a corner of the ring once', () => {
		expect(
			reshaped(SQUARE, [
				[-1, 11],
				[0, 10],
				[5, 5],
				[10, 10],
				[11, 11],
			]),
		).toEqual([
			[0, 10],
			[5, 5],
			[10, 10],
			[10, 0],
			[0, 0],
		]);
	});

	/**
	 * A ring is handed back wound the way it came in, whichever of the two arcs
	 * the sketch replaced.
	 *
	 * One sketch over the same square read in both directions. The arcs are
	 * walked forward either way, so the direction is carried rather than
	 * recomputed, and a caller re-reading the ring is not handed a flipped one.
	 */
	it('leaves a ring wound the way it was given', () => {
		const clockwise = reshaped(SQUARE, BULGE);
		const counterclockwise = reshaped(SQUARE_BACKWARDS, BULGE);

		expect(windingOf(clockwise as PlanarPath)).toBe(windingOf(SQUARE));
		expect(windingOf(counterclockwise as PlanarPath)).toBe(windingOf(SQUARE_BACKWARDS));
		expect(windingOf(SQUARE)).not.toBe(windingOf(SQUARE_BACKWARDS));
	});

	/**
	 * A sketch drawn out and straight back over its own path replaces the whole
	 * stretch with a line, which is two positions and no area.
	 *
	 * Reported as a reshape rather than a refusal on purpose: this helper answers
	 * what the sketch leaves, and whether two positions are a shape the caller can
	 * hold is the caller's rule. `use-map-draw` runs the covers-ground rule on it
	 * and refuses the Finish.
	 */
	it('collapses a ring the sketch folds back on itself', () => {
		expect(
			reshaped(SQUARE, [
				[5, -1],
				[5, 11],
				[5, -1],
			]),
		).toEqual([
			[5, 0],
			[5, 11],
		]);
	});

	it('replaces the stretch of a line between its two crossings', () => {
		expect(
			reshaped(
				LINE,
				[
					[2, -1],
					[2, 2],
					[8, 2],
					[8, -1],
				],
				false,
			),
		).toEqual([
			[0, 0],
			[2, 0],
			[2, 2],
			[8, 2],
			[8, 0],
			[10, 0],
		]);
	});

	// The sketch is turned to follow the line rather than the pointer, so which
	// end the user started at is not part of the answer.
	it('gives a line the same result whichever way the sketch was drawn', () => {
		expect(
			reshaped(
				LINE,
				[
					[8, -1],
					[8, 2],
					[2, 2],
					[2, -1],
				],
				false,
			),
		).toEqual([
			[0, 0],
			[2, 0],
			[2, 2],
			[8, 2],
			[8, 0],
			[10, 0],
		]);
	});

	// A line has two ends and a ring has none, so a sketch that steps around both
	// ends has crossed nothing. The same sketch over a ring would cross twice.
	it('refuses a sketch that goes around both ends of a line', () => {
		expect(
			reshaped(
				LINE,
				[
					[-1, -1],
					[-1, 1],
					[11, 1],
					[11, -1],
				],
				false,
			),
		).toBe('tooFewCrossings');
	});

	it('refuses a sketch that never reaches the boundary', () => {
		expect(
			reshaped(SQUARE, [
				[2, 2],
				[8, 8],
			]),
		).toBe('tooFewCrossings');
	});

	it('refuses a sketch that crosses the boundary once', () => {
		expect(
			reshaped(SQUARE, [
				[5, 5],
				[5, 15],
			]),
		).toBe('tooFewCrossings');
	});

	// A sketch traced along the boundary has no position to name as a crossing,
	// and it is not a reshape anybody drew.
	it('refuses a sketch lying along an edge', () => {
		expect(
			reshaped(SQUARE, [
				[2, 10],
				[8, 10],
			]),
		).toBe('tooFewCrossings');
	});

	it('refuses a sketch of one position', () => {
		expect(reshaped(SQUARE, [[5, 10]])).toBe('tooFewCrossings');
	});
});

describe('sketchCrossings', () => {
	it('reports crossings in the order the sketch makes them', () => {
		const crossings = sketchCrossings(
			SQUARE,
			[
				[-1, 2],
				[11, 2],
			],
			true,
		);

		expect(crossings.map((at) => at.position)).toEqual([
			[0, 2],
			[10, 2],
		]);
		expect(crossings.map((at) => at.pathEdge)).toEqual([0, 2]);
	});

	// One sketch segment can cross several edges, and the order they are found in
	// is the ring's rather than the pointer's.
	it('orders several crossings on one sketch segment along that segment', () => {
		const crossings = sketchCrossings(
			SQUARE,
			[
				[11, 2],
				[-1, 2],
			],
			true,
		);

		expect(crossings.map((at) => at.position)).toEqual([
			[10, 2],
			[0, 2],
		]);
	});

	/**
	 * A sketch vertex landing on the boundary is found by both sketch segments
	 * that meet there. Counted twice it would let a sketch that touches once look
	 * like it had crossed twice, which is exactly the refusal this tool owes.
	 */
	it('counts a touch on the boundary once', () => {
		expect(
			sketchCrossings(
				SQUARE,
				[
					[5, 15],
					[5, 10],
					[15, 15],
				],
				true,
			),
		).toHaveLength(1);
	});

	it('gives a ring the edge that closes it and a line none', () => {
		const sketch: PlanarPath = [
			[5, -1],
			[5, 1],
		];

		expect(sketchCrossings(SQUARE, sketch, true)).toHaveLength(1);
		expect(sketchCrossings(SQUARE, sketch, false)).toHaveLength(0);
	});
});

/**
 * A hole cut out of {@link SQUARE} well clear of the equator, so a sketch along
 * y=5 misses it entirely. Wound the way the square is, which is how a user who
 * drew both by hand leaves them.
 */
const HIGH_HOLE: PlanarPath = [
	[2, 8],
	[2, 9],
	[4, 9],
	[4, 8],
];

/** A hole straddling y=5, so the same sketch cuts through it. */
const STRADDLING_HOLE: PlanarPath = [
	[3, 3],
	[3, 7],
	[7, 7],
	[7, 3],
];

/** A line running west to east across {@link SQUARE}, out both sides. */
const ACROSS: PlanarPath = [
	[-1, 5],
	[11, 5],
];

function split(
	rings: readonly PlanarPath[],
	sketch: PlanarPath,
	closed = true,
): readonly SplitPart[] | string {
	const outcome = splitRings({ rings, sketch, closed });
	return outcome.kind === 'split' ? outcome.parts : outcome.refusal;
}

describe('splitRings', () => {
	/**
	 * The plain case, and the one every other expectation below is read against.
	 * The sketch runs out both sides of the square, so the stretch of it that
	 * counts is the part between the two crossings and the tails are dropped.
	 */
	it('cuts an outline in two along the sketch', () => {
		expect(split([SQUARE], ACROSS)).toEqual([
			[
				[
					[0, 5],
					[0, 10],
					[10, 10],
					[10, 5],
				],
			],
			[
				[
					[10, 5],
					[10, 0],
					[0, 0],
					[0, 5],
				],
			],
		]);
	});

	/**
	 * Both halves come back wound the way the outline arrived, which the
	 * coordinates above do not say out loud. A split that flipped one of them
	 * would still draw correctly and would write a ring the next reader has to
	 * guess at.
	 */
	it('keeps the winding the outline arrived with', () => {
		const clockwise = split([SQUARE], ACROSS);
		const counterClockwise = split([SQUARE_BACKWARDS], ACROSS);

		expect(Array.isArray(clockwise) && clockwise.map((part) => windingOf(part[0] ?? []))).toEqual([
			-1, -1,
		]);
		expect(
			Array.isArray(counterClockwise) && counterClockwise.map((part) => windingOf(part[0] ?? [])),
		).toEqual([1, 1]);
	});

	/**
	 * A hole the sketch misses is not touched at all: it goes to the piece that
	 * contains it, corner for corner and wound as it was.
	 */
	it('gives a hole on one side of the sketch to that side', () => {
		expect(split([SQUARE, HIGH_HOLE], ACROSS)).toEqual([
			[
				[
					[0, 5],
					[0, 10],
					[10, 10],
					[10, 5],
				],
				HIGH_HOLE,
			],
			[
				[
					[10, 5],
					[10, 0],
					[0, 0],
					[0, 5],
				],
			],
		]);
	});

	/**
	 * The case worth the walk. A hole the sketch also crosses stops being a hole:
	 * each of its two arcs becomes part of the outline of one piece, which is what
	 * PostGIS does and the only answer that writes without a repair. Both pieces
	 * come back with one ring and no hole at all.
	 *
	 * Half the square is 50 and half the hole is 8, so each piece covers 42.
	 */
	it('turns a hole the sketch crosses into the boundary of both pieces', () => {
		expect(split([SQUARE, STRADDLING_HOLE], ACROSS)).toEqual([
			[
				[
					[7, 5],
					[7, 7],
					[3, 7],
					[3, 5],
					[0, 5],
					[0, 10],
					[10, 10],
					[10, 5],
				],
			],
			[
				[
					[3, 5],
					[3, 3],
					[7, 3],
					[7, 5],
					[10, 5],
					[10, 0],
					[0, 0],
					[0, 5],
				],
			],
		]);
	});

	/**
	 * Two holes at once, one of each kind, because the crossed one is dropped from
	 * the hole list by index and placing the missed one after it is where an
	 * off-by-one would land.
	 */
	it('places a missed hole while a crossed one becomes boundary', () => {
		const parts = split([SQUARE, STRADDLING_HOLE, HIGH_HOLE], ACROSS);

		expect(Array.isArray(parts) && parts.map((part) => part.slice(1))).toEqual([[HIGH_HOLE], []]);
	});

	it('cuts a line in two at the one place the sketch crosses it', () => {
		expect(
			split(
				[LINE],
				[
					[7, -1],
					[7, 1],
				],
				false,
			),
		).toEqual([
			[
				[
					[0, 0],
					[5, 0],
					[7, 0],
				],
			],
			[
				[
					[7, 0],
					[10, 0],
				],
			],
		]);
	});

	it('refuses a sketch that never reaches the outline', () => {
		expect(
			split(
				[SQUARE],
				[
					[20, 20],
					[30, 30],
				],
			),
		).toBe('doesNotDivide');
	});

	/**
	 * A sketch that stops inside leaves a slit rather than a cut. It is the
	 * refusal the tool owes most often, because it is what a gesture that has not
	 * finished looks like.
	 */
	it('refuses a sketch that crosses the outline once', () => {
		expect(
			split(
				[SQUARE],
				[
					[-1, 5],
					[5, 5],
				],
			),
		).toBe('doesNotDivide');
	});

	it('refuses a sketch that only touches the outline', () => {
		expect(
			split(
				[SQUARE],
				[
					[5, 15],
					[5, 10],
					[15, 15],
				],
			),
		).toBe('doesNotDivide');
	});

	/**
	 * In, out, in, out leaves three pieces. Splitting into more than two from one
	 * sketch is out of scope, and a part list that grew by two from one gesture is
	 * not something the toolbar could name.
	 */
	it('refuses a sketch that would leave three pieces', () => {
		expect(
			split(
				[SQUARE],
				[
					[-1, 2],
					[11, 2],
					[11, 8],
					[-1, 8],
				],
			),
		).toBe('doesNotDivide');
	});

	it('refuses a line the sketch crosses twice', () => {
		expect(
			split(
				[LINE],
				[
					[2, -1],
					[2, 1],
					[7, 1],
					[7, -1],
				],
				false,
			),
		).toBe('doesNotDivide');
	});
});

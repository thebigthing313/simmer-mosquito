import { describe, expect, it } from 'vitest';
import {
	closeRing,
	hasDistinctPositions,
	insertRingVertex,
	moveRingVertex,
	nearestRingEdge,
	removeRingVertex,
	unclosedRing,
} from '../../draw-vertex-edit.js';
import type { PlanarPath } from '../../sketch.js';
import { samePlanarPosition } from '../../sketch.js';

/**
 * The ring edit operations, from an input to a value.
 *
 * Seven of these eight were reachable only through the draw control's hook
 * suite, which renders React against a fake Mapbox map to ask what
 * `unclosedRing` does to a four-position ring (#640). Nothing here builds a map
 * or a component: the answers are arithmetic over a run of positions.
 *
 * One square, wound clockwise from the origin, at plain magnitudes, the way
 * `sketch.test.ts` writes its corpus. Nothing below reports a distance, so a
 * realistic longitude would only make the expectations harder to read.
 */
const SQUARE: PlanarPath = [
	[0, 0],
	[0, 10],
	[10, 10],
	[10, 0],
];

/** A hole inside {@link SQUARE}, so a case can name ring 1. */
const HOLE: PlanarPath = [
	[2, 2],
	[2, 4],
	[4, 4],
];

describe('samePlanarPosition', () => {
	it('reads a rounding step apart as the same corner', () => {
		expect(samePlanarPosition([1, 2], [1 + 1e-12, 2 - 1e-12])).toBe(true);
	});

	it('reads a step wider than the tolerance as two corners', () => {
		expect(samePlanarPosition([1, 2], [1 + 1e-6, 2])).toBe(false);
		expect(samePlanarPosition([1, 2], [1, 2 + 1e-6])).toBe(false);
	});

	// The ends of an empty ring are both undefined, and an empty ring is not a
	// closed one.
	it('reads a missing position as no corner at all', () => {
		expect(samePlanarPosition(undefined, [1, 2])).toBe(false);
		expect(samePlanarPosition([1, 2], undefined)).toBe(false);
		expect(samePlanarPosition(undefined, undefined)).toBe(false);
	});
});

describe('closeRing', () => {
	it('repeats the first position at the end', () => {
		expect(closeRing(SQUARE)).toEqual([
			[0, 0],
			[0, 10],
			[10, 10],
			[10, 0],
			[0, 0],
		]);
	});

	it('leaves a ring that already closes alone', () => {
		const closed = closeRing(SQUARE);

		expect(closeRing(closed)).toEqual(closed);
	});

	it('has nothing to close in an empty ring', () => {
		expect(closeRing([])).toEqual([]);
	});

	// A single click is a part with one position, and closing it would invent an
	// edge from a corner back to itself.
	it('leaves one position as one position', () => {
		expect(closeRing([[3, 4]])).toEqual([[3, 4]]);
	});
});

describe('unclosedRing', () => {
	it('drops the repeated closing position', () => {
		expect(unclosedRing(closeRing(SQUARE))).toEqual(SQUARE);
	});

	// A ring adopted from a file or a region is only closed if whoever wrote it
	// closed it, and slicing one that is not would lose a real corner.
	it('leaves a ring that does not close alone', () => {
		expect(unclosedRing(SQUARE)).toEqual(SQUARE);
	});

	it('reads a closing position a rounding step off as closed', () => {
		const nearlyClosed: PlanarPath = [...SQUARE, [1e-12, -1e-12]];

		expect(unclosedRing(nearlyClosed)).toEqual(SQUARE);
	});

	// One position repeated is length 2, and dropping the repeat would leave a
	// corner. One position on its own is not closed by anything.
	it('leaves a single position alone', () => {
		expect(unclosedRing([[3, 4]])).toEqual([[3, 4]]);
		expect(unclosedRing([])).toEqual([]);
	});
});

describe('moveRingVertex', () => {
	it('moves the named vertex and leaves the rest where they were', () => {
		expect(moveRingVertex([SQUARE], { ring: 0, vertex: 1 }, [1, 11])).toEqual([
			[
				[0, 0],
				[1, 11],
				[10, 10],
				[10, 0],
			],
		]);
	});

	it('reaches the holes as well as the outline', () => {
		const moved = moveRingVertex([SQUARE, HOLE], { ring: 1, vertex: 2 }, [5, 5]);

		expect(moved).toEqual([
			SQUARE,
			[
				[2, 2],
				[2, 4],
				[5, 5],
			],
		]);
	});

	it('has no answer for a vertex no ring holds', () => {
		expect(moveRingVertex([SQUARE], { ring: 1, vertex: 0 }, [1, 1])).toBeNull();
		expect(moveRingVertex([SQUARE], { ring: 0, vertex: 4 }, [1, 1])).toBeNull();
	});
});

describe('insertRingVertex', () => {
	it('puts the position after the vertex the edge is named by', () => {
		expect(insertRingVertex([SQUARE], { ring: 0, vertex: 1 }, [5, 10])).toEqual([
			[
				[0, 0],
				[0, 10],
				[5, 10],
				[10, 10],
				[10, 0],
			],
		]);
	});

	// The last vertex names the edge that closes an area, so a position on that
	// edge lands at the end and the ring stays wound the way it was drawn.
	it('lands a position on the closing edge at the end', () => {
		expect(insertRingVertex([SQUARE], { ring: 0, vertex: 3 }, [5, 0])).toEqual([
			[
				[0, 0],
				[0, 10],
				[10, 10],
				[10, 0],
				[5, 0],
			],
		]);
	});

	it('has no answer for an edge no ring holds', () => {
		expect(insertRingVertex([SQUARE], { ring: 2, vertex: 0 }, [1, 1])).toBeNull();
		expect(insertRingVertex([SQUARE], { ring: 0, vertex: 4 }, [1, 1])).toBeNull();
	});
});

describe('removeRingVertex', () => {
	it('drops the named vertex', () => {
		expect(removeRingVertex([SQUARE], { ring: 0, vertex: 2 })).toEqual([
			[
				[0, 0],
				[0, 10],
				[10, 0],
			],
		]);
	});

	// Below the three an area needs is allowed on purpose: the draft says it
	// cannot be finished and recovers the moment a vertex comes back.
	it('takes a ring below the three an area needs', () => {
		const triangle = [SQUARE.slice(0, 3)];

		expect(removeRingVertex(triangle, { ring: 0, vertex: 0 })).toEqual([
			[
				[0, 10],
				[10, 10],
			],
		]);
	});

	// An edge is the only way to put a vertex back, so a ring below two is a
	// draft only Undo and Cancel can leave.
	it('refuses to take a ring below two positions', () => {
		expect(
			removeRingVertex(
				[
					[
						[0, 0],
						[0, 10],
					],
				],
				{ ring: 0, vertex: 0 },
			),
		).toBeNull();
	});

	it('has no answer for a vertex no ring holds', () => {
		expect(removeRingVertex([SQUARE], { ring: 1, vertex: 0 })).toBeNull();
		expect(removeRingVertex([SQUARE], { ring: 0, vertex: 9 })).toBeNull();
	});
});

/**
 * Which edge a click on the boundary lands on. The map settles that the pointer
 * is on the shape; this settles which of its edges was meant, and a wrong answer
 * puts the new vertex on the far side of the ring.
 */
describe('nearestRingEdge', () => {
	it('names an edge by the vertex it starts at', () => {
		expect(nearestRingEdge([SQUARE], [0, 5], true)).toEqual({ ring: 0, vertex: 0 });
		expect(nearestRingEdge([SQUARE], [5, 10], true)).toEqual({ ring: 0, vertex: 1 });
	});

	// The closing edge is the one an area has and a line does not, and the one an
	// insert appended to the end of the list would silently get wrong.
	it('gives an area the edge that closes it and a line none', () => {
		expect(nearestRingEdge([SQUARE], [7, 0.5], true)).toEqual({ ring: 0, vertex: 3 });
		expect(nearestRingEdge([SQUARE], [7, 0.5], false)).toEqual({ ring: 0, vertex: 2 });
	});

	it('reaches the holes as well as the outline', () => {
		expect(nearestRingEdge([SQUARE, HOLE], [2, 3], true)).toEqual({ ring: 1, vertex: 0 });
	});

	it('has no edge to name in an empty ring', () => {
		expect(nearestRingEdge([[]], [0, 0], true)).toBeNull();
	});
});

describe('hasDistinctPositions', () => {
	it('counts corners rather than positions', () => {
		const stacked: PlanarPath = [
			[0, 0],
			[0, 0],
			[0, 0],
		];

		expect(hasDistinctPositions(stacked, 3)).toBe(false);
		expect(hasDistinctPositions(stacked, 1)).toBe(true);
	});

	it('reads a ring with the corners an area needs', () => {
		expect(hasDistinctPositions(SQUARE, 3)).toBe(true);
	});

	// Closure repeats a position, so a closed triangle has four entries and the
	// three corners somebody placed.
	it('does not count a closing position as a fourth corner', () => {
		const closedTriangle = closeRing(SQUARE.slice(0, 3));

		expect(closedTriangle).toHaveLength(4);
		expect(hasDistinctPositions(closedTriangle, 4)).toBe(false);
		expect(hasDistinctPositions(closedTriangle, 3)).toBe(true);
	});

	it('has no corners in an empty ring', () => {
		expect(hasDistinctPositions([], 1)).toBe(false);
		expect(hasDistinctPositions([], 0)).toBe(true);
	});
});

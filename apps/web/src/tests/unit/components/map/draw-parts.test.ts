import type { PlanarPath, PlanarPosition } from '@simmer-mosquito/mapping';
import { describe, expect, it } from 'vitest';
import type {
	DrawGeometry,
	DrawGeometryFor,
	DrawGeometryType,
	DrawMode,
	DrawPartGeometry,
	DrawTarget,
	EditMode,
	Mode,
} from '../../../../components/map/draw-parts';
import {
	continuationProblem,
	dedupeTrailing,
	draftPart,
	draftProgress,
	drawHoles,
	drawParts,
	editedRings,
	editProblem,
	finishedParts,
	geometryFromParts,
	holeProblem,
	piecesProblem,
	sketchProblem,
	toDrawGeometry,
	undoneEdit,
	withParts,
} from '../../../../components/map/draw-parts';

/*
 * The same shapes the gesture suite next door draws, so a case that used to be
 * asserted through a fake map and `act()` asserts the same coordinates here
 * (#630). No jsdom environment, no map and no React: every function below takes
 * geometry and answers with geometry.
 */

const FIRST_SQUARE = [
	[-90, 35],
	[-90, 36],
	[-89, 36],
] as const;
const SECOND_SQUARE = [
	[-80, 35],
	[-80, 36],
	[-79, 36],
] as const;
/** A four-corner area with room inside it, so a hole has somewhere to go. */
const BLOCK = [
	[-91, 34],
	[-91, 37],
	[-88, 37],
	[-88, 34],
] as const;
/** Well inside {@link BLOCK}. */
const POND = [
	[-90, 35],
	[-90, 36],
	[-89, 36],
	[-89, 35],
] as const;
/** Two corners inside {@link BLOCK} and two outside its eastern edge. */
const ESCAPING_POND = [
	[-89, 35],
	[-89, 36],
	[-85, 36],
	[-85, 35],
] as const;
/** A line straight down the middle of {@link BLOCK}, out both sides. */
const ACROSS_BLOCK = [
	[-89.5, 33],
	[-89.5, 38],
] as const;

function closed(ring: readonly (readonly [number, number])[]): PlanarPath {
	return [...ring, ring[0] as PlanarPosition];
}

function polygon(...rings: readonly (readonly (readonly [number, number])[])[]): DrawPartGeometry {
	return { type: 'Polygon', coordinates: rings.map(closed) };
}

/** An edit open on `rings`, which is what {@link EditMode} holds mid-gesture. */
function editing({
	rings,
	type = 'Polygon',
	sketch = null,
	allowsParts = true,
	history = [],
}: {
	readonly rings: readonly PlanarPath[];
	readonly type?: DrawGeometryType;
	readonly sketch?: EditMode['sketch'];
	readonly allowsParts?: boolean;
	readonly history?: readonly (readonly PlanarPath[])[];
}): EditMode {
	return {
		kind: 'edit',
		type,
		partIndex: 0,
		rings,
		history,
		selected: null,
		sketch,
		allowsParts,
	};
}

function drawing(target: DrawTarget, type: DrawGeometryType = 'Polygon'): DrawMode {
	return { kind: 'draw', type, target };
}

describe('holeProblem', () => {
	it('accepts a ring the piece encloses', () => {
		expect(holeProblem(polygon(BLOCK), [...POND])).toBeNull();
	});

	it('refuses a ring with a corner outside the piece', () => {
		expect(holeProblem(polygon(BLOCK), [...ESCAPING_POND])).toBe('escapes');
	});

	// A hole is outside the piece, so a second one drawn into the first has
	// escaped as surely as one drawn over the edge.
	it('refuses a ring drawn inside a hole the piece already has', () => {
		expect(
			holeProblem(polygon(BLOCK, POND), [
				[-89.9, 35.1],
				[-89.9, 35.9],
				[-89.1, 35.9],
			]),
		).toBe('escapes');
	});

	it('refuses a ring that takes the whole piece', () => {
		expect(holeProblem(polygon(BLOCK), [...BLOCK])).toBe('swallows');
	});

	// The draft turns red from the first stray corner, before there are three of
	// them, so the refusal is on screen while the pointer is still moving.
	it('reports an escape before the ring can close', () => {
		expect(holeProblem(polygon(BLOCK), [[-85, 35]])).toBe('escapes');
	});

	it('holds off on a ring too short to enclose anything yet', () => {
		expect(
			holeProblem(polygon(BLOCK), [
				[-90, 35],
				[-90, 36],
			]),
		).toBeNull();
	});

	it('has nothing to say about a piece with no inside', () => {
		expect(holeProblem({ type: 'Point', coordinates: [-90, 35] }, [...POND])).toBeNull();
	});
});

describe('continuationProblem', () => {
	const committed: DrawGeometry = polygon(BLOCK, POND);
	const mode = drawing({ kind: 'continue', partIndex: 0, seeded: BLOCK.length });

	it('accepts an outline that still encloses the holes', () => {
		expect(continuationProblem(polygon(BLOCK), mode, committed)).toBeNull();
	});

	// An appended corner can carve the outline inward past a ring cut earlier,
	// and PostGIS calls the result invalid.
	it('refuses an outline redrawn away from a hole it had', () => {
		const carved = polygon([
			[-91, 34],
			[-91, 37],
			[-89.5, 37],
			[-89.5, 34],
		]);

		expect(continuationProblem(carved, mode, committed)).toBe('holesEscape');
	});

	it('has nothing to say about a draw that is not a continuation', () => {
		expect(
			continuationProblem(polygon(FIRST_SQUARE), drawing({ kind: 'replace' }), null),
		).toBeNull();
	});
});

describe('editProblem', () => {
	it('accepts the rings a piece was opened with', () => {
		expect(editProblem(editing({ rings: [[...BLOCK]] }))).toBeNull();
	});

	it('refuses a ring left below the corners an area needs', () => {
		expect(
			editProblem(
				editing({
					rings: [
						[
							[-91, 34],
							[-91, 37],
						],
					],
				}),
			),
		).toBe('tooFewVertices');
	});

	// Three corners on one line: enough of them, and no area between them. Three
	// clicks in one spot land the same way.
	it('refuses an outline with corners enough and no ground under it', () => {
		expect(
			editProblem(
				editing({
					rings: [
						[
							[-91, 34],
							[-90, 34],
							[-89, 34],
						],
					],
				}),
			),
		).toBe('coversNoGround');
	});

	it('refuses an edit that pushes a hole out of its outline', () => {
		expect(editProblem(editing({ rings: [[...FIRST_SQUARE], [...POND]] }))).toBe('holesEscape');
	});

	it('refuses a reshape line that never crosses the boundary twice', () => {
		expect(
			editProblem(
				editing({
					rings: [[...BLOCK]],
					sketch: {
						tool: 'reshape',
						positions: [
							[-95, 38],
							[-94, 38],
						],
					},
				}),
			),
		).toBe('tooFewCrossings');
	});

	it('refuses a split line that leaves the piece whole', () => {
		expect(
			editProblem(
				editing({
					rings: [[...BLOCK]],
					sketch: {
						tool: 'split',
						positions: [
							[-95, 38],
							[-94, 38],
						],
					},
				}),
			),
		).toBe('doesNotDivide');
	});

	// Read before the sketch is, so the record kind is the answer rather than
	// whatever the line happened to do.
	it('refuses a split on a record kind with nowhere to put the second piece', () => {
		expect(
			editProblem(
				editing({
					rings: [[...BLOCK]],
					allowsParts: false,
					sketch: { tool: 'split', positions: [...ACROSS_BLOCK] },
				}),
			),
		).toBe('cannotHoldParts');
	});

	it('accepts a split that divides the piece where the kind can hold both', () => {
		expect(
			editProblem(
				editing({ rings: [[...BLOCK]], sketch: { tool: 'split', positions: [...ACROSS_BLOCK] } }),
			),
		).toBeNull();
	});
});

describe('sketchProblem', () => {
	// The one place this vocabulary says null while Finish is still unavailable:
	// a line of one vertex is a draw in progress, not a refusal.
	it('says nothing about a line too short to have done anything', () => {
		expect(sketchProblem({ tool: 'split', positions: [[-89.5, 33]] })).toBeNull();
		expect(sketchProblem({ tool: 'reshape', positions: [] })).toBeNull();
	});

	it('names the failure each tool means', () => {
		const positions: readonly PlanarPosition[] = [
			[-95, 38],
			[-94, 38],
		];

		expect(sketchProblem({ tool: 'split', positions })).toBe('doesNotDivide');
		expect(sketchProblem({ tool: 'reshape', positions })).toBe('tooFewCrossings');
	});
});

describe('piecesProblem', () => {
	const mode = editing({ rings: [[...BLOCK]] });

	it('reads the rings in order, corners before area', () => {
		expect(
			piecesProblem(mode, [
				[
					[
						[-91, 34],
						[-91, 37],
					],
				],
			]),
		).toBe('tooFewVertices');
	});

	it('names an outline enclosing nothing', () => {
		expect(
			piecesProblem(mode, [
				[
					[
						[-91, 34],
						[-90, 34],
						[-89, 34],
					],
				],
			]),
		).toBe('coversNoGround');
	});

	it('accepts pieces that would go back as they stand', () => {
		expect(piecesProblem(mode, [[[...BLOCK]]])).toBeNull();
	});
});

describe('drawParts', () => {
	it('takes a multi shape apart and puts it back', () => {
		const multi: DrawGeometry = {
			type: 'MultiPolygon',
			coordinates: [[closed(FIRST_SQUARE)], [closed(SECOND_SQUARE)]],
		};

		const parts = drawParts(multi);

		expect(parts.map((part) => part.type)).toEqual(['Polygon', 'Polygon']);
		expect(geometryFromParts(parts)).toEqual(multi);
	});

	// A one-part multi shape is what ogr2ogr writes for a single-lot feature. The
	// domain demotes one on the way in, and this is the same rule on the way out.
	it('demotes a shape that is down to one piece', () => {
		const parts = drawParts({ type: 'MultiPoint', coordinates: [[-90, 35]] });

		expect(geometryFromParts(parts)).toEqual({ type: 'Point', coordinates: [-90, 35] });
	});

	it('reads nothing as no pieces', () => {
		expect(drawParts(null)).toEqual([]);
		expect(geometryFromParts([])).toBeNull();
	});
});

describe('drawHoles', () => {
	it('reads every ring past the outline as a hole', () => {
		expect(drawHoles(polygon(BLOCK, POND))).toEqual([closed(POND)]);
	});

	it('reads a shape that cannot hold one as holding none', () => {
		expect(drawHoles({ type: 'Point', coordinates: [-90, 35] })).toEqual([]);
		expect(drawHoles(polygon(BLOCK))).toEqual([]);
	});
});

describe('toDrawGeometry', () => {
	it('reads a stored multi shape back, now that pieces can be edited', () => {
		const multi = { type: 'MultiPolygon', coordinates: [[closed(FIRST_SQUARE)]] };

		expect(toDrawGeometry(multi)).toEqual(multi);
	});

	it('still reads a geometry collection as nothing', () => {
		expect(toDrawGeometry({ type: 'GeometryCollection', geometries: [] })).toBeNull();
	});
});

describe('withParts', () => {
	const existing = [polygon(FIRST_SQUARE), polygon(SECOND_SQUARE)];
	const drawn = polygon(BLOCK);

	it('throws the committed pieces away for a replace', () => {
		expect(withParts(existing, { kind: 'replace' }, [drawn])).toEqual([drawn]);
	});

	it('appends for an add', () => {
		expect(withParts(existing, { kind: 'part' }, [drawn])).toEqual([...existing, drawn]);
	});

	it('swaps the piece a hole, a continuation or an edit names', () => {
		expect(withParts(existing, { kind: 'edit', partIndex: 1 }, [drawn])).toEqual([
			existing[0],
			drawn,
		]);
	});

	// Both halves of a split go in where the one they replace was, so the pieces
	// of a shape stay in the order they sit on the map.
	it('puts both halves of a split at the index the piece came from', () => {
		const halves = [polygon(POND), polygon(BLOCK)];

		expect(withParts(existing, { kind: 'edit', partIndex: 0 }, halves)).toEqual([
			...halves,
			existing[1],
		]);
	});
});

describe('editedRings', () => {
	it('hands the rings straight back when no line is open', () => {
		const rings = [[...BLOCK]];

		expect(editedRings(editing({ rings }))).toEqual([rings]);
	});

	it('leaves two pieces where a split line divides the outline', () => {
		const cut = editedRings(
			editing({ rings: [[...BLOCK]], sketch: { tool: 'split', positions: [...ACROSS_BLOCK] } }),
		);

		expect(cut).toHaveLength(2);
	});

	it('leaves nothing where the line does not do what its tool means', () => {
		expect(
			editedRings(
				editing({
					rings: [[...BLOCK]],
					sketch: {
						tool: 'split',
						positions: [
							[-95, 38],
							[-94, 38],
						],
					},
				}),
			),
		).toBeNull();
	});
});

describe('dedupeTrailing', () => {
	// A double-click to finish lands as two near-identical clicks, and the saved
	// shape must not carry a zero-length final segment.
	it('drops a trailing vertex repeating the one before it', () => {
		expect(
			dedupeTrailing([
				[-90, 35],
				[-90, 36],
				[-90, 36],
			]),
		).toEqual([
			[-90, 35],
			[-90, 36],
		]);
	});

	it('leaves a ring whose last two corners differ', () => {
		const ring: readonly PlanarPosition[] = [...FIRST_SQUARE];

		expect(dedupeTrailing(ring)).toEqual(ring);
	});
});

describe('draftPart', () => {
	it('commits the outline a replace drew', () => {
		expect(draftPart(drawing({ kind: 'replace' }), null, [...BLOCK])).toEqual(polygon(BLOCK));
	});

	// `canFinish` reads this, so Finish cannot promise a write the server answers
	// 400. Three clicks in one spot passed a bare vertex count.
	it('refuses an outline with three corners and no area', () => {
		expect(
			draftPart(drawing({ kind: 'replace' }), null, [
				[-90, 35],
				[-90, 35],
				[-90, 35],
			]),
		).toBeNull();
	});

	it('carries a continued piece back with the holes it had', () => {
		const committed = polygon(BLOCK, POND);
		const mode = drawing({ kind: 'continue', partIndex: 0, seeded: BLOCK.length });

		expect(draftPart(mode, committed, [...BLOCK])).toEqual(polygon(BLOCK, POND));
	});

	it('refuses a hole the piece would not enclose', () => {
		const mode = drawing({ kind: 'hole', partIndex: 0 });

		expect(draftPart(mode, polygon(BLOCK), [...ESCAPING_POND])).toBeNull();
	});
});

describe('finishedParts', () => {
	it('says where a finished draw goes and what it commits', () => {
		const target: DrawTarget = { kind: 'part' };

		expect(finishedParts(drawing(target), polygon(FIRST_SQUARE), [...BLOCK])).toEqual({
			target,
			parts: [polygon(BLOCK)],
		});
	});

	it('commits both halves of a split at the index the piece came from', () => {
		const mode = editing({
			rings: [[...BLOCK]],
			sketch: { tool: 'split', positions: [...ACROSS_BLOCK] },
		});

		expect(finishedParts(mode, polygon(BLOCK), [])?.parts).toHaveLength(2);
	});

	// A point commits on its own first click and has no Finish button under it.
	it('has nothing to commit for a point draw', () => {
		expect(finishedParts(drawing({ kind: 'replace' }, 'Point'), null, [[-90, 35]])).toBeNull();
	});
});

describe('draftProgress', () => {
	it('counts the vertices placed and offers Finish once they make a shape', () => {
		const mode = drawing({ kind: 'replace' });

		expect(draftProgress(mode, null, [...FIRST_SQUARE])).toEqual({
			drawType: 'Polygon',
			vertexCount: 3,
			canFinish: true,
			canUndo: true,
		});
	});

	// Undo stops at the vertices a continuation opened with rather than eating
	// into the piece the user asked to continue.
	it('stops Undo at the vertices a continuation opened with', () => {
		const mode = drawing({ kind: 'continue', partIndex: 0, seeded: BLOCK.length });

		expect(draftProgress(mode, polygon(BLOCK), [...BLOCK]).canUndo).toBe(false);
	});

	it('counts every corner of an edit, the holes included', () => {
		const mode = editing({ rings: [[...BLOCK], [...POND]] });

		expect(draftProgress(mode, polygon(BLOCK, POND), []).vertexCount).toBe(
			BLOCK.length + POND.length,
		);
	});

	// A line that has been started and has no vertices yet is still something to
	// take back: Undo is what closes an empty one.
	it('offers Undo on a line with no vertices on it yet', () => {
		const mode = editing({ rings: [[...BLOCK]], sketch: { tool: 'reshape', positions: [] } });

		expect(draftProgress(mode, polygon(BLOCK), []).canUndo).toBe(true);
	});
});

describe('undoneEdit', () => {
	it('unwinds an open line one vertex at a time', () => {
		const mode = editing({
			rings: [[...BLOCK]],
			sketch: { tool: 'reshape', positions: [...ACROSS_BLOCK] },
		});

		const undone = undoneEdit(mode) as EditMode;

		expect(undone.sketch?.positions).toEqual([ACROSS_BLOCK[0]]);
	});

	// Without this step a line nobody wanted could only be left by abandoning the
	// whole edit.
	it('closes a line that has nothing left on it', () => {
		const mode = editing({ rings: [[...BLOCK]], sketch: { tool: 'reshape', positions: [] } });

		expect((undoneEdit(mode) as EditMode).sketch).toBeNull();
	});

	it('stops at the piece as it was opened', () => {
		const opened = editing({ rings: [[...BLOCK]] });

		expect(undoneEdit(opened)).toEqual(opened);
	});

	it('leaves a mode that is not an edit alone', () => {
		const idle: Mode = { kind: 'idle' };

		expect(undoneEdit(idle)).toBe(idle);
	});
});

/**
 * What the five form predicates assert, checked by `tsc` rather than by vitest.
 *
 * The annotation on each line is the case; the `expect` beside it only proves
 * the case ran. The `@ts-expect-error` pair is what catches a regression: a
 * predicate rewritten to assert `DrawGeometry` or a hand-written `GeoJsonPoint`
 * would make the directive suppress nothing and `tsc` would fail on it.
 */
describe('DrawGeometryFor', () => {
	it('is the drawn shapes the policy names', () => {
		const boundary: DrawGeometryFor<'region'> = {
			type: 'MultiPolygon',
			coordinates: [[closed(FIRST_SQUARE)]],
		};
		const placed: DrawGeometryFor<'address'> = { type: 'Point', coordinates: [-74.35, 40.55] };

		expect(boundary.type).toBe('MultiPolygon');
		expect(placed.type).toBe('Point');
	});

	it('refuses a shape the policy leaves out', () => {
		// One line each: `@ts-expect-error` covers the line below it, and an object
		// literal spread over three puts the error on a line the directive misses.
		const ring = closed(FIRST_SQUARE);
		// @ts-expect-error A Region stores areas, so nothing its policy narrows is a Point.
		const refusedByRegion: DrawGeometryFor<'region'> = { type: 'Point', coordinates: [0, 0] };
		// @ts-expect-error An Address stores one point, so nothing its policy narrows is a line.
		const refusedByAddress: DrawGeometryFor<'address'> = { type: 'LineString', coordinates: ring };

		expect(refusedByRegion.type).toBe('Point');
		expect(refusedByAddress.type).toBe('LineString');
	});
});

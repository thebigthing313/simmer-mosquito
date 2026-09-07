import type { PlanarPath, PlanarPosition } from '@simmer-mosquito/mapping';
import { describe, expect, it } from 'vitest';
import { buildFeatures } from '../../../../components/map/draw-features';
import type {
	DrawGeometry,
	DrawPartGeometry,
	DrawTarget,
	EditMode,
	Mode,
} from '../../../../components/map/draw-parts';

/*
 * What the draw control puts in its source, asserted from a mode and a shape
 * rather than from a gesture (#630). No jsdom, no fake map and no `act()`: the
 * cases below hand `buildFeatures` the same arguments the hook does and read the
 * features back.
 */

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
const FAR_SQUARE = [
	[-80, 35],
	[-80, 36],
	[-79, 36],
] as const;

function closed(ring: readonly (readonly [number, number])[]): PlanarPath {
	return [...ring, ring[0] as PlanarPosition];
}

function polygon(...rings: readonly (readonly (readonly [number, number])[])[]): DrawPartGeometry {
	return { type: 'Polygon', coordinates: rings.map(closed) };
}

function drawing(target: DrawTarget, type: 'Point' | 'LineString' | 'Polygon' = 'Polygon'): Mode {
	return { kind: 'draw', type, target };
}

function editing(rings: readonly PlanarPath[], sketch: EditMode['sketch'] = null): EditMode {
	return {
		kind: 'edit',
		type: 'Polygon',
		partIndex: 0,
		rings,
		history: [],
		selected: null,
		sketch,
		allowsParts: true,
	};
}

/** The arguments the hook passes, with everything a case does not care about off. */
function features({
	committed = null,
	mode = { kind: 'idle' },
	vertices = [],
	cursor = null,
	drag = null,
	highlighted = null,
}: Partial<Parameters<typeof buildFeatures>[0]> = {}) {
	return buildFeatures({ committed, mode, vertices, cursor, drag, highlighted }).features;
}

/** What each feature is for, which is the property the layers paint by. */
function roles(collection: readonly GeoJSON.Feature[]): (string | undefined)[] {
	return collection.map(
		(feature) => (feature.properties?.role as string | undefined) ?? feature.geometry.type,
	);
}

describe('buildFeatures', () => {
	it('draws nothing at all with no shape and no draw open', () => {
		expect(features()).toEqual([]);
	});

	it('draws a committed area as its outline and one vertex per corner', () => {
		expect(roles(features({ committed: polygon(BLOCK) }))).toEqual([
			'Polygon',
			'vertex',
			'vertex',
			'vertex',
			'vertex',
		]);
	});

	// A hole's corners are drawn the way the outline's are, so they can be seen
	// and counted.
	it('draws the corners of a hole as well as the outline', () => {
		expect(roles(features({ committed: polygon(BLOCK, POND) }))).toHaveLength(
			1 + BLOCK.length + POND.length,
		);
	});

	it('draws a committed point as a point rather than a corner', () => {
		expect(roles(features({ committed: { type: 'Point', coordinates: [-90, 35] } }))).toEqual([
			'point',
		]);
	});

	it('marks only the highlighted piece', () => {
		const committed: DrawGeometry = {
			type: 'MultiPolygon',
			coordinates: [[closed(BLOCK)], [closed(FAR_SQUARE)]],
		};

		const drawn = features({ committed, highlighted: 1 });

		expect(drawn.filter((feature) => feature.properties?.highlighted === true)).toHaveLength(
			1 + FAR_SQUARE.length,
		);
	});

	// The draft is that piece, and drawing both would put a finished outline under
	// a changing one.
	it('hides the committed piece an edit has taken over', () => {
		const drawn = features({ committed: polygon(BLOCK), mode: editing([[...BLOCK]]) });

		expect(drawn.filter((feature) => feature.properties?.ring === undefined)).toHaveLength(1);
	});

	it('hides the committed piece a continuation has taken over', () => {
		const mode = drawing({ kind: 'continue', partIndex: 0, seeded: BLOCK.length });

		expect(features({ committed: polygon(BLOCK), mode, vertices: [...BLOCK] })).toHaveLength(
			1 + BLOCK.length,
		);
	});

	it('runs a rubber band from the placed corners to the cursor', () => {
		const drawn = features({
			mode: drawing({ kind: 'replace' }),
			vertices: [
				[-91, 34],
				[-91, 37],
			],
			cursor: [-88, 37],
		});

		expect(drawn[0]?.geometry).toEqual({
			type: 'Polygon',
			coordinates: [
				[
					...closed([
						[-91, 34],
						[-91, 37],
						[-88, 37],
					]),
				],
			],
		});
	});

	// The refusal is on the map and not only under the Finish button. The piece
	// the hole is being cut into stays as it was, so only the draft over it turns.
	it('paints a hole the control would refuse', () => {
		const drawn = features({
			committed: polygon(BLOCK),
			mode: drawing({ kind: 'hole', partIndex: 0 }),
			vertices: [...ESCAPING_POND],
		});
		const draft = drawn.slice(1 + BLOCK.length);

		expect(draft).not.toHaveLength(0);
		expect(draft.every((feature) => feature.properties?.refused === true)).toBe(true);
	});

	it('leaves a hole the piece encloses unpainted', () => {
		const drawn = features({
			committed: polygon(BLOCK),
			mode: drawing({ kind: 'hole', partIndex: 0 }),
			vertices: [...POND],
		});

		expect(drawn.some((feature) => feature.properties?.refused === true)).toBe(false);
	});

	// A vertex carries the ring and the index it sits at, so the pointer hit-test
	// reads its target off the feature rather than searching the rings.
	it('numbers an edit vertex by the ring and the corner it sits at', () => {
		const drawn = features({
			committed: polygon(BLOCK, POND),
			mode: editing([[...BLOCK], [...POND]]),
		});
		const corners = drawn.flatMap((feature) =>
			feature.properties?.ring === undefined
				? []
				: [[feature.properties.ring, feature.properties.vertex]],
		);

		expect(corners).toEqual([
			[0, 0],
			[0, 1],
			[0, 2],
			[0, 3],
			[1, 0],
			[1, 1],
			[1, 2],
			[1, 3],
		]);
	});

	it('marks the corner Delete would take', () => {
		const mode: EditMode = { ...editing([[...BLOCK]]), selected: { ring: 0, vertex: 2 } };

		const picked = features({ committed: polygon(BLOCK), mode }).filter(
			(feature) => feature.properties?.highlighted === true,
		);

		expect(picked.map((feature) => feature.properties?.vertex)).toEqual([2]);
	});

	// Drawn under the cursor before the move lands, which is what makes the drag
	// look like one.
	it('draws a grabbed corner where the cursor is, before the move lands', () => {
		const drawn = features({
			committed: polygon(BLOCK),
			mode: editing([[...BLOCK]]),
			drag: { vertex: { ring: 0, vertex: 0 }, position: [-92, 33] },
		});

		expect(drawn[1]?.geometry).toEqual({ type: 'Point', coordinates: [-92, 33] });
	});

	// The result is on the map before the sketch is finished, and a split draws
	// both pieces.
	it('previews both pieces a split line would leave', () => {
		const mode = editing([[...BLOCK]], {
			tool: 'split',
			positions: [
				[-89.5, 33],
				[-89.5, 38],
			],
		});

		const outlines = features({ committed: polygon(BLOCK), mode }).filter(
			(feature) => feature.geometry.type === 'Polygon',
		);

		expect(outlines).toHaveLength(2);
	});

	// Drawn over the previewed pieces rather than instead of them, because a line
	// that has not done its job leaves the shape as it was.
	it('draws the traced line over a piece the sketch has not divided', () => {
		const mode = editing([[...BLOCK]], {
			tool: 'split',
			positions: [
				[-95, 38],
				[-94, 38],
			],
		});

		const drawn = features({ committed: polygon(BLOCK), mode });

		expect(drawn.filter((feature) => feature.geometry.type === 'LineString')).toHaveLength(1);
		expect(drawn.every((feature) => feature.properties?.refused === true)).toBe(true);
	});
});

// @vitest-environment jsdom
import type { Map as MapboxMap } from 'mapbox-gl';
import { act, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nearestRingEdge } from '../../../../components/map/draw-vertex-edit';
import type { DrawGeometry } from '../../../../components/map/use-map-draw';
import {
	drawHoles,
	drawParts,
	geometryFromParts,
	toDrawGeometry,
	useMapDraw,
} from '../../../../components/map/use-map-draw';
import type { FakeMap } from './fake-map';
import { cleanupRenderedHooks, createFakeMap, pressKey, renderHook } from './fake-map';

const SOURCE_ID = 'habitat-draw';
const LAYER_IDS = [
	'habitat-draw-fill',
	'habitat-draw-outline',
	'habitat-draw-line',
	'habitat-draw-vertex',
	'habitat-draw-point',
];

afterEach(cleanupRenderedHooks);

function mount(value: DrawGeometry | null = null) {
	const fake = createFakeMap();
	const onChange = vi.fn();
	const harness = renderHook(useMapDraw, {
		map: fake.map,
		isLoaded: true,
		value,
		onChange,
	});
	return { fake, onChange, ...harness };
}

/**
 * The same hook with the committed value fed back in, which is what every form
 * does. A piece is added to whatever the last change committed, so a harness
 * that pins `value` cannot see the second piece at all.
 */
function useControlledDraw({
	map,
	initial,
}: {
	readonly map: MapboxMap;
	readonly initial: DrawGeometry | null;
}) {
	const [value, setValue] = useState<DrawGeometry | null>(initial);
	return { value, draw: useMapDraw({ map, isLoaded: true, value, onChange: setValue }) };
}

function mountControlled(initial: DrawGeometry | null = null) {
	const fake = createFakeMap();
	return { fake, ...renderHook(useControlledDraw, { map: fake.map, initial }) };
}

type ControlledHarness = ReturnType<typeof mountControlled>;

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

/** Place a ring's vertices and finish it, the way a user draws one. */
function drawPolygon(
	fake: FakeMap,
	result: ControlledHarness['result'],
	ring: readonly (readonly [number, number])[],
): void {
	if (!result.current.draw.isDrawing) {
		act(() => {
			result.current.draw.start('Polygon');
		});
	}
	for (const [longitude, latitude] of ring) {
		act(() => {
			fake.click(longitude, latitude);
		});
	}
	act(() => {
		result.current.draw.finish();
	});
}

function closed(ring: readonly (readonly [number, number])[]): (readonly [number, number])[] {
	return [...ring, ring[0] as readonly [number, number]];
}

/** Roles carried by the features the draft source is holding, in order. */
function roles(fake: FakeMap): (string | undefined)[] {
	return fake
		.featuresOf(SOURCE_ID)
		.map((feature) => feature.properties?.role ?? feature.geometry.type);
}

describe('useMapDraw', () => {
	it('adds the draft source and its layers in order', () => {
		const { fake } = mount();

		expect(fake.sources.has(SOURCE_ID)).toBe(true);
		expect([...fake.layers.keys()]).toEqual(LAYER_IDS);
	});

	it('waits for the map to report itself loaded', () => {
		const fake = createFakeMap();
		renderHook(useMapDraw, {
			map: fake.map,
			isLoaded: false,
			value: null,
			onChange: vi.fn(),
		});

		expect(fake.sources.size).toBe(0);
		expect(fake.layers.size).toBe(0);
	});

	it('renders a committed point as a point feature', () => {
		const { fake } = mount({ type: 'Point', coordinates: [-90.1, 35.1] });

		expect(roles(fake)).toEqual(['point']);
		expect(fake.featuresOf(SOURCE_ID)[0]?.geometry).toEqual({
			type: 'Point',
			coordinates: [-90.1, 35.1],
		});
	});

	it('renders a committed polygon as the shape plus its vertices', () => {
		const ring: readonly (readonly [number, number])[] = [
			[-90, 35],
			[-90, 36],
			[-89, 36],
			[-90, 35],
		];
		const { fake } = mount({ type: 'Polygon', coordinates: [ring] });

		expect(roles(fake)).toEqual(['Polygon', 'vertex', 'vertex', 'vertex']);
	});

	it('finishes a point on the first click', () => {
		const { fake, onChange, result } = mount();

		act(() => {
			result.current.start('Point');
		});
		expect(result.current.isDrawing).toBe(true);
		// Starting a draw clears whatever was committed before.
		expect(onChange).toHaveBeenCalledWith(null);

		act(() => {
			fake.click(-90.4, 35.4);
		});

		expect(onChange).toHaveBeenLastCalledWith({ type: 'Point', coordinates: [-90.4, 35.4] });
		expect(result.current.isDrawing).toBe(false);
	});

	it('collects vertices for a polygon and finishes into a closed ring', () => {
		const { fake, onChange, result } = mount();

		act(() => {
			result.current.start('Polygon');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-90, 36);
		});
		act(() => {
			fake.click(-89, 36);
		});

		expect(result.current.vertexCount).toBe(3);
		expect(result.current.canFinish).toBe(true);
		// Three placed vertices already preview as the polygon they will become.
		expect(roles(fake)).toEqual(['Polygon', 'vertex', 'vertex', 'vertex']);

		act(() => {
			result.current.finish();
		});

		expect(onChange).toHaveBeenLastCalledWith({
			type: 'Polygon',
			coordinates: [
				[
					[-90, 35],
					[-90, 36],
					[-89, 36],
					[-90, 35],
				],
			],
		});
	});

	it('draws a rubber band to the cursor while a line is in progress', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.start('LineString');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.move(-89, 36);
		});

		const [shape] = fake.featuresOf(SOURCE_ID);
		expect(shape?.geometry).toEqual({
			type: 'LineString',
			coordinates: [
				[-90, 35],
				[-89, 36],
			],
		});
	});

	it('drops the placed vertices on Escape', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.start('Polygon');
		});
		act(() => {
			fake.click(-90, 35);
		});
		pressKey('Escape');

		expect(result.current.isDrawing).toBe(false);
		expect(result.current.vertexCount).toBe(0);
		expect(fake.featuresOf(SOURCE_ID)).toEqual([]);
	});

	it('undoes the last placed vertex', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.start('Polygon');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-90, 36);
		});
		act(() => {
			result.current.undo();
		});

		expect(result.current.vertexCount).toBe(1);
	});

	// The step a careless extraction breaks: a basemap switch wipes every custom
	// source and layer, and the in-progress shape has to come back with them.
	it('puts the source, layers, and the shape in progress back after a basemap switch', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.start('Polygon');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-90, 36);
		});

		fake.wipeStyle();
		expect(fake.sources.size).toBe(0);

		act(() => {
			fake.emit('style.load');
		});

		expect([...fake.layers.keys()]).toEqual(LAYER_IDS);
		expect(roles(fake)).toEqual(['LineString', 'vertex', 'vertex']);
	});

	// The rubber band lives in a ref, not in state, so a restyle has to repaint
	// from the refs — re-seeding the source from the last render would snap the
	// line back to the last placed vertex.
	it('keeps the rubber band pinned to the cursor across a basemap switch', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.start('LineString');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.move(-89, 36);
		});

		fake.wipeStyle();
		act(() => {
			fake.emit('style.load');
		});

		expect(fake.featuresOf(SOURCE_ID)[0]?.geometry).toEqual({
			type: 'LineString',
			coordinates: [
				[-90, 35],
				[-89, 36],
			],
		});
	});

	it('puts a committed geometry back after a basemap switch', () => {
		const { fake } = mount({ type: 'Point', coordinates: [-90.1, 35.1] });

		fake.wipeStyle();
		act(() => {
			fake.emit('style.load');
		});

		expect([...fake.layers.keys()]).toEqual(LAYER_IDS);
		expect(roles(fake)).toEqual(['point']);
	});

	it('removes its layers and source on unmount', () => {
		const { fake, unmount } = mount({ type: 'Point', coordinates: [-90.1, 35.1] });

		unmount();

		expect(fake.layers.size).toBe(0);
		expect(fake.sources.size).toBe(0);
		expect(fake.listenerCount('style.load')).toBe(0);
	});

	// `useMapboxMap`'s cleanup calls `map.remove()` first on unmount, so the
	// teardown runs against a map that throws on every call.
	it('survives a map that was already removed', () => {
		const { fake, unmount } = mount();

		fake.remove();

		expect(() => {
			unmount();
		}).not.toThrow();
	});

	it('leaves the map alone until a draw actually starts', () => {
		const { fake } = mount();

		expect(fake.listenerCount('click')).toBe(0);
		expect(fake.canvas.style.cursor).toBe('');
		expect(fake.isDoubleClickZoomEnabled()).toBe(true);
	});

	it('restores the cursor and double-click zoom when the draw ends', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.start('Polygon');
		});
		expect(fake.canvas.style.cursor).toBe('crosshair');
		expect(fake.isDoubleClickZoomEnabled()).toBe(false);

		act(() => {
			result.current.cancel();
		});

		expect(fake.canvas.style.cursor).toBe('');
		expect(fake.isDoubleClickZoomEnabled()).toBe(true);
		expect(fake.listenerCount('click')).toBe(0);
	});

	it('adopts a geometry obtained some other way', () => {
		const { onChange, result } = mount();

		act(() => {
			result.current.start('Polygon');
		});
		act(() => {
			result.current.commit({ type: 'Point', coordinates: [-90.9, 35.9] });
		});

		expect(onChange).toHaveBeenLastCalledWith({ type: 'Point', coordinates: [-90.9, 35.9] });
		expect(result.current.isDrawing).toBe(false);
	});

	it('keeps a committed shape on the map while another piece is drawn', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.startPart();
		});
		for (const [longitude, latitude] of SECOND_SQUARE) {
			act(() => {
				fake.click(longitude, latitude);
			});
		}

		expect(roles(fake)).toEqual([
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
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		expect(result.current.value?.type).toBe('Polygon');

		act(() => {
			result.current.draw.startPart();
		});
		expect(result.current.draw.isAddingPart).toBe(true);
		drawPolygon(fake, result, SECOND_SQUARE);

		expect(result.current.value?.type).toBe('MultiPolygon');
		expect(drawParts(result.current.value)).toHaveLength(2);

		act(() => {
			result.current.draw.removePart(0);
		});

		expect(result.current.value).toEqual({ type: 'Polygon', coordinates: [closed(SECOND_SQUARE)] });
	});

	it('leaves nothing behind when the last piece goes', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.removePart(0);
		});

		expect(result.current.value).toBeNull();
		expect(drawParts(result.current.value)).toEqual([]);
	});

	it('adds a point piece on one click, the way a first point is placed', () => {
		const { fake, result } = mountControlled();

		act(() => {
			result.current.draw.start('Point');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			result.current.draw.startPart();
		});
		act(() => {
			fake.click(-80, 36);
		});

		expect(result.current.value).toEqual({
			type: 'MultiPoint',
			coordinates: [
				[-90, 35],
				[-80, 36],
			],
		});
		expect(result.current.draw.isDrawing).toBe(false);
	});

	// "Redraw geometry" means the whole shape at any piece count, which is what
	// puts the piece list directly above the button that does it.
	it('takes every piece when the draw is a redraw', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.startPart();
		});
		drawPolygon(fake, result, SECOND_SQUARE);

		act(() => {
			result.current.draw.start('Polygon');
		});

		expect(result.current.value).toBeNull();
		expect(drawParts(result.current.value)).toEqual([]);
	});

	it('has no piece to add before the first one is drawn', () => {
		const { result } = mountControlled();

		act(() => {
			result.current.draw.startPart();
		});

		expect(result.current.draw.isDrawing).toBe(false);
	});

	// An Undo that reached back into a finished piece would eat work the user
	// cannot get back, so it pops inside the piece being drawn and stops at zero.
	it('undoes inside the piece being drawn and never into a finished one', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.startPart();
		});
		act(() => {
			fake.click(-80, 35);
		});
		act(() => {
			result.current.draw.undo();
		});
		act(() => {
			result.current.draw.undo();
		});

		expect(result.current.draw.vertexCount).toBe(0);
		expect(drawParts(result.current.value)).toHaveLength(1);
	});

	it('picks out the highlighted piece for the map to paint', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.startPart();
		});
		drawPolygon(fake, result, SECOND_SQUARE);
		act(() => {
			result.current.draw.highlightPart(1);
		});

		const shapes = fake
			.featuresOf(SOURCE_ID)
			.filter((feature) => feature.geometry.type === 'Polygon');
		expect(shapes.map((feature) => feature.properties?.highlighted)).toEqual([false, true]);
	});

	it('cuts a hole into the piece it was told to, as a second ring', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		act(() => {
			result.current.draw.startHole(0);
		});
		expect(result.current.draw.holeDraft).toEqual({ partNumber: 1, partCount: 1, problem: null });
		for (const [longitude, latitude] of POND) {
			act(() => {
				fake.click(longitude, latitude);
			});
		}
		expect(result.current.draw.canFinish).toBe(true);
		act(() => {
			result.current.draw.finish();
		});

		expect(result.current.value).toEqual({
			type: 'Polygon',
			coordinates: [closed(BLOCK), closed(POND)],
		});
		// Still one piece: a hole is a ring of the piece, not another piece.
		expect(drawParts(result.current.value)).toHaveLength(1);
	});

	// The one validity rule the control buys, because the point-in-polygon test
	// already ships. Everything else a bad ring can be is #437.
	it('refuses to finish a hole that has left its piece', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		act(() => {
			result.current.draw.startHole(0);
		});
		for (const [longitude, latitude] of ESCAPING_POND) {
			act(() => {
				fake.click(longitude, latitude);
			});
		}

		expect(result.current.draw.canFinish).toBe(false);
		expect(result.current.draw.holeDraft).toEqual({
			partNumber: 1,
			partCount: 1,
			problem: 'escapes',
		});

		act(() => {
			result.current.draw.finish();
		});
		expect(result.current.value).toEqual({ type: 'Polygon', coordinates: [closed(BLOCK)] });
	});

	// A vertex outside is enough, before there are three of them to close a ring,
	// so the draft is red while the pointer is still moving.
	it('paints a straying hole red from the first vertex outside', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		act(() => {
			result.current.draw.startHole(0);
		});
		act(() => {
			fake.click(-70, 35.5);
		});

		expect(result.current.draw.holeDraft?.problem).toBe('escapes');
		const drafts = fake
			.featuresOf(SOURCE_ID)
			.filter((feature) => feature.properties?.role === 'vertex' && feature.properties?.refused);
		expect(drafts).toHaveLength(1);
	});

	// A hole drawn to the piece's own boundary leaves a polygon covering no
	// ground, which the server answers 400, so Finish has to refuse it here.
	it('refuses a hole that takes the whole piece', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		act(() => {
			result.current.draw.startHole(0);
		});
		for (const [longitude, latitude] of BLOCK) {
			act(() => {
				fake.click(longitude, latitude);
			});
		}

		expect(result.current.draw.holeDraft?.problem).toBe('swallows');
		expect(result.current.draw.canFinish).toBe(false);
	});

	// A hole cannot be cut where there is no inside to cut. The containment check
	// would read a position pair as a ring and call every vertex escaped, so this
	// is refused in the controller rather than by whichever button is hidden.
	it('refuses to start a hole in a piece that is not an area', () => {
		const { fake, result } = mountControlled();

		act(() => {
			result.current.draw.start('Point');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			result.current.draw.startHole(0);
		});

		expect(result.current.draw.isDrawing).toBe(false);
		expect(result.current.draw.holeDraft).toBeNull();
	});

	it('refuses to start a hole in a piece that is not there', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		act(() => {
			result.current.draw.startHole(3);
		});

		expect(result.current.draw.isDrawing).toBe(false);
	});

	it('cuts into the piece the row names, not the first one', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.startPart();
		});
		drawPolygon(fake, result, BLOCK);

		act(() => {
			result.current.draw.startHole(1);
		});
		expect(result.current.draw.holeDraft?.partNumber).toBe(2);
		for (const [longitude, latitude] of POND) {
			act(() => {
				fake.click(longitude, latitude);
			});
		}
		act(() => {
			result.current.draw.finish();
		});

		expect(result.current.value).toEqual({
			type: 'MultiPolygon',
			coordinates: [[closed(FIRST_SQUARE)], [closed(BLOCK), closed(POND)]],
		});
	});

	it('drops one hole and leaves the piece alone', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		act(() => {
			result.current.draw.startHole(0);
		});
		for (const [longitude, latitude] of POND) {
			act(() => {
				fake.click(longitude, latitude);
			});
		}
		act(() => {
			result.current.draw.finish();
		});
		act(() => {
			result.current.draw.removeHole(0, 0);
		});

		expect(result.current.value).toEqual({ type: 'Polygon', coordinates: [closed(BLOCK)] });
	});

	it('adds to a finished area and keeps the vertices it already had', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.continuePart(0);
		});
		expect(result.current.draw.vertexCount).toBe(3);
		act(() => {
			fake.click(-89, 35);
		});
		act(() => {
			result.current.draw.finish();
		});

		expect(result.current.value).toEqual({
			type: 'Polygon',
			coordinates: [closed([...FIRST_SQUARE, [-89, 35] as const])],
		});
	});

	// A ring adopted from a file or a region is only closed if whoever wrote it
	// closed it, and slicing one that is not would lose a corner.
	it('keeps every corner of an unclosed ring it continues', () => {
		const { result } = mountControlled({ type: 'Polygon', coordinates: [[...FIRST_SQUARE]] });

		act(() => {
			result.current.draw.continuePart(0);
		});

		expect(result.current.draw.vertexCount).toBe(3);
	});

	it('adds to a finished line at its end', () => {
		const { fake, result } = mountControlled();

		act(() => {
			result.current.draw.start('LineString');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-90, 36);
		});
		act(() => {
			result.current.draw.finish();
		});
		act(() => {
			result.current.draw.continuePart(0);
		});
		act(() => {
			fake.click(-89, 36);
		});
		act(() => {
			result.current.draw.finish();
		});

		expect(result.current.value).toEqual({
			type: 'LineString',
			coordinates: [
				[-90, 35],
				[-90, 36],
				[-89, 36],
			],
		});
	});

	// A point is one position. There is no end to pick up from.
	it('has nothing to continue on a point', () => {
		const { fake, result } = mountControlled();

		act(() => {
			result.current.draw.start('Point');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			result.current.draw.continuePart(0);
		});

		expect(result.current.draw.isDrawing).toBe(false);
		expect(result.current.draw.continuedPart).toBeNull();
	});

	it('refuses to continue a piece that is not there', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.continuePart(4);
		});

		expect(result.current.draw.isDrawing).toBe(false);
	});

	it('leaves the other pieces alone while one is continued', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.startPart();
		});
		drawPolygon(fake, result, SECOND_SQUARE);

		act(() => {
			result.current.draw.continuePart(1);
		});
		expect(result.current.draw.continuedPart).toEqual({
			partNumber: 2,
			partCount: 2,
			problem: null,
		});
		act(() => {
			fake.click(-79, 35);
		});
		act(() => {
			result.current.draw.finish();
		});

		expect(result.current.value).toEqual({
			type: 'MultiPolygon',
			coordinates: [[closed(FIRST_SQUARE)], [closed([...SECOND_SQUARE, [-79, 35] as const])]],
		});
	});

	// The piece being continued is the draft, so drawing it twice would put a
	// finished outline under a growing one.
	it('draws the piece being continued once, as the draft', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.startPart();
		});
		drawPolygon(fake, result, SECOND_SQUARE);
		act(() => {
			result.current.draw.continuePart(0);
		});

		const shapes = fake
			.featuresOf(SOURCE_ID)
			.filter((feature) => feature.geometry.type === 'Polygon');
		expect(shapes).toHaveLength(2);
	});

	it('puts the piece back as it was when a continuation is cancelled', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.continuePart(0);
		});
		act(() => {
			fake.click(-89, 35);
		});
		act(() => {
			result.current.draw.cancel();
		});

		expect(result.current.value).toEqual({ type: 'Polygon', coordinates: [closed(FIRST_SQUARE)] });
		expect(result.current.draw.isDrawing).toBe(false);
	});

	// Undo pops what the continuation added and stops there. Eating into the
	// piece's own vertices would take back work the user never asked to undo.
	it('undoes only the vertices a continuation added', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.continuePart(0);
		});
		expect(result.current.draw.canUndo).toBe(false);
		act(() => {
			fake.click(-89, 35);
		});
		expect(result.current.draw.canUndo).toBe(true);

		act(() => {
			result.current.draw.undo();
		});
		expect(result.current.draw.vertexCount).toBe(3);
		expect(result.current.draw.canUndo).toBe(false);

		act(() => {
			result.current.draw.undo();
		});
		expect(result.current.draw.vertexCount).toBe(3);
	});

	it('keeps the holes already cut into the piece it continues', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		act(() => {
			result.current.draw.startHole(0);
		});
		for (const [longitude, latitude] of POND) {
			act(() => {
				fake.click(longitude, latitude);
			});
		}
		act(() => {
			result.current.draw.finish();
		});

		act(() => {
			result.current.draw.continuePart(0);
		});
		// The outline's vertices only. A hole is its own ring and is not being
		// redrawn.
		expect(result.current.draw.vertexCount).toBe(4);
		act(() => {
			fake.click(-88, 33);
		});
		act(() => {
			result.current.draw.finish();
		});

		expect(result.current.value).toEqual({
			type: 'Polygon',
			coordinates: [closed([...BLOCK, [-88, 33] as const]), closed(POND)],
		});
	});

	// Appending a vertex can carve the outline inward, and a hole left outside it
	// is a polygon PostGIS calls invalid.
	it('refuses to finish a continuation that has pushed a hole outside', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		act(() => {
			result.current.draw.startHole(0);
		});
		for (const [longitude, latitude] of POND) {
			act(() => {
				fake.click(longitude, latitude);
			});
		}
		act(() => {
			result.current.draw.finish();
		});

		act(() => {
			result.current.draw.continuePart(0);
		});
		act(() => {
			fake.click(-89.5, 36.5);
		});

		expect(result.current.draw.canFinish).toBe(false);
		expect(result.current.draw.continuedPart?.problem).toBe('holesEscape');
		// Red on the map too, so the refusal is not only a greyed-out button.
		const refused = fake
			.featuresOf(SOURCE_ID)
			.filter((feature) => feature.properties?.refused === true);
		expect(refused.length).toBeGreaterThan(0);

		act(() => {
			result.current.draw.finish();
		});
		expect(result.current.value).toEqual({
			type: 'Polygon',
			coordinates: [closed(BLOCK), closed(POND)],
		});
	});

	// The piece being continued is hidden and redrawn as the draft, so its holes
	// have to come with it, corners and all.
	it('keeps a hole and its corners on the map through a continuation', () => {
		const { fake, result } = mountControlled({
			type: 'Polygon',
			coordinates: [closed(BLOCK), closed(POND)],
		});

		act(() => {
			result.current.draw.continuePart(0);
		});

		expect(roles(fake)).toEqual([
			'Polygon',
			'vertex',
			'vertex',
			'vertex',
			'vertex',
			'vertex',
			'vertex',
			'vertex',
			'vertex',
		]);
	});

	it('renders the corners of a hole as vertices of its piece', () => {
		const { fake } = mount({
			type: 'Polygon',
			coordinates: [closed(BLOCK), closed(POND)],
		});

		expect(roles(fake)).toEqual([
			'Polygon',
			'vertex',
			'vertex',
			'vertex',
			'vertex',
			'vertex',
			'vertex',
			'vertex',
			'vertex',
		]);
	});

	it('moves a vertex of a finished piece and commits it where it was dropped', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.editPart(0);
		});
		act(() => {
			result.current.draw.moveVertex({ ring: 0, vertex: 2 }, [-88, 36]);
		});
		act(() => {
			result.current.draw.finish();
		});

		expect(result.current.value).toEqual({
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
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.editPart(0);
		});
		act(() => {
			result.current.draw.insertVertex({ ring: 0, vertex: 0 }, [-90, 35.5]);
		});
		// The new corner is the one Delete acts on, so clicking an edge and pressing
		// Delete takes back exactly what it added.
		expect(result.current.draw.editedPart?.selected).toEqual({ ring: 0, vertex: 1 });
		act(() => {
			result.current.draw.finish();
		});

		expect(result.current.value).toEqual({
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
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.editPart(0);
		});
		act(() => {
			result.current.draw.deleteVertex({ ring: 0, vertex: 2 });
		});

		expect(result.current.draw.canFinish).toBe(false);
		expect(result.current.draw.editedPart?.problem).toBe('tooFewVertices');
		// Red on the map too, so the refusal is not only a greyed-out button.
		const refused = fake
			.featuresOf(SOURCE_ID)
			.filter((feature) => feature.properties?.refused === true);
		expect(refused.length).toBeGreaterThan(0);

		act(() => {
			result.current.draw.insertVertex({ ring: 0, vertex: 1 }, [-89, 36]);
		});
		expect(result.current.draw.canFinish).toBe(true);
		expect(result.current.draw.editedPart?.problem).toBeNull();
	});

	// An edge is the only way to put a vertex back, and a ring of one has none, so
	// two is where Delete stops. Removing a ring whole is Remove's job.
	it('keeps the two vertices an edge needs', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.editPart(0);
		});
		act(() => {
			result.current.draw.deleteVertex({ ring: 0, vertex: 2 });
		});
		act(() => {
			result.current.draw.deleteVertex({ ring: 0, vertex: 1 });
		});

		expect(result.current.draw.vertexCount).toBe(2);
		// The refused Delete recorded nothing, so one Undo is back to three.
		act(() => {
			result.current.draw.undo();
		});
		expect(result.current.draw.vertexCount).toBe(3);
		expect(result.current.draw.canUndo).toBe(false);
	});

	it('puts the piece back as it was when an edit is cancelled, holes included', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		act(() => {
			result.current.draw.startHole(0);
		});
		for (const [longitude, latitude] of POND) {
			act(() => {
				fake.click(longitude, latitude);
			});
		}
		act(() => {
			result.current.draw.finish();
		});

		act(() => {
			result.current.draw.editPart(0);
		});
		act(() => {
			result.current.draw.moveVertex({ ring: 1, vertex: 0 }, [-89.5, 35.5]);
		});
		act(() => {
			result.current.draw.cancel();
		});

		expect(result.current.value).toEqual({
			type: 'Polygon',
			coordinates: [closed(BLOCK), closed(POND)],
		});
		expect(result.current.draw.isDrawing).toBe(false);
	});

	it('edits a hole ring with the same three gestures as the outline', () => {
		const { result } = mountControlled({
			type: 'Polygon',
			coordinates: [closed(BLOCK), closed(POND)],
		});

		act(() => {
			result.current.draw.editPart(0);
		});
		act(() => {
			result.current.draw.moveVertex({ ring: 1, vertex: 0 }, [-90.5, 35]);
		});
		act(() => {
			result.current.draw.insertVertex({ ring: 1, vertex: 2 }, [-89, 35.5]);
		});
		act(() => {
			result.current.draw.deleteVertex({ ring: 1, vertex: 4 });
		});
		act(() => {
			result.current.draw.finish();
		});

		expect(result.current.value).toEqual({
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
		const { result } = mountControlled({
			type: 'Polygon',
			coordinates: [closed(BLOCK), closed(POND)],
		});

		act(() => {
			result.current.draw.editPart(0);
		});
		act(() => {
			result.current.draw.moveVertex({ ring: 0, vertex: 2 }, [-89.5, 36.5]);
		});

		expect(result.current.draw.canFinish).toBe(false);
		expect(result.current.draw.editedPart?.problem).toBe('holesEscape');

		act(() => {
			result.current.draw.finish();
		});
		expect(result.current.value).toEqual({
			type: 'Polygon',
			coordinates: [closed(BLOCK), closed(POND)],
		});
	});

	it('leaves the other pieces alone and keeps the edited one at its index', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.startPart();
		});
		drawPolygon(fake, result, SECOND_SQUARE);

		act(() => {
			result.current.draw.editPart(0);
		});
		expect(result.current.draw.editedPart).toEqual({
			partNumber: 1,
			partCount: 2,
			problem: null,
			selected: null,
		});
		act(() => {
			result.current.draw.moveVertex({ ring: 0, vertex: 0 }, [-91, 35]);
		});
		act(() => {
			result.current.draw.finish();
		});

		expect(result.current.value).toEqual({
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
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.startPart();
		});
		drawPolygon(fake, result, SECOND_SQUARE);
		act(() => {
			result.current.draw.editPart(0);
		});

		const shapes = fake
			.featuresOf(SOURCE_ID)
			.filter((feature) => feature.geometry.type === 'Polygon');
		expect(shapes).toHaveLength(2);
	});

	it('refuses to edit a piece that is not there', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.editPart(4);
		});

		expect(result.current.draw.isDrawing).toBe(false);
		expect(result.current.draw.editedPart).toBeNull();
	});

	// A point has no end to carry on from, which is why Continue skips it, and one
	// corner to pick up, which is why this does not.
	it('moves the position of a point piece', () => {
		const { fake, result } = mountControlled();

		act(() => {
			result.current.draw.start('Point');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			result.current.draw.editPart(0);
		});
		expect(result.current.draw.isDrawing).toBe(true);
		act(() => {
			result.current.draw.moveVertex({ ring: 0, vertex: 0 }, [-89, 34]);
		});
		act(() => {
			result.current.draw.finish();
		});

		expect(result.current.value).toEqual({ type: 'Point', coordinates: [-89, 34] });
	});

	// Undo takes back gestures and stops at the piece as it was opened. Eating
	// into it would take back work the user never asked to undo.
	it('undoes only the gestures an edit made', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.editPart(0);
		});
		expect(result.current.draw.canUndo).toBe(false);

		act(() => {
			result.current.draw.moveVertex({ ring: 0, vertex: 0 }, [-91, 35]);
		});
		act(() => {
			result.current.draw.insertVertex({ ring: 0, vertex: 0 }, [-90.5, 35.5]);
		});
		expect(result.current.draw.canUndo).toBe(true);

		act(() => {
			result.current.draw.undo();
		});
		act(() => {
			result.current.draw.undo();
		});
		expect(result.current.draw.canUndo).toBe(false);

		act(() => {
			result.current.draw.undo();
		});
		act(() => {
			result.current.draw.finish();
		});
		expect(result.current.value).toEqual({ type: 'Polygon', coordinates: [closed(FIRST_SQUARE)] });
	});

	it('picks the vertex Delete acts on and drops the pick with it', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.editPart(0);
		});
		act(() => {
			result.current.draw.selectVertex({ ring: 0, vertex: 1 });
		});
		expect(result.current.draw.editedPart?.selected).toEqual({ ring: 0, vertex: 1 });

		act(() => {
			result.current.draw.deleteVertex({ ring: 0, vertex: 1 });
		});
		expect(result.current.draw.editedPart?.selected).toBeNull();
		expect(result.current.draw.vertexCount).toBe(2);
	});

	it('resolves a requested point on the next click', async () => {
		const { fake, result } = mount();

		let pending: Promise<unknown> | null = null;
		act(() => {
			pending = result.current.requestPoint();
		});
		expect(result.current.isRequestingPoint).toBe(true);

		act(() => {
			fake.click(-90.7, 35.7);
		});

		await expect(pending).resolves.toEqual({ type: 'Point', coordinates: [-90.7, 35.7] });
		expect(result.current.isRequestingPoint).toBe(false);
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
		const holes = drawHoles({ type: 'Polygon', coordinates: [closed(BLOCK), closed(POND)] });

		expect(holes).toEqual([closed(POND)]);
	});

	it('reads a shape that cannot hold one as holding none', () => {
		expect(drawHoles({ type: 'Point', coordinates: [-90, 35] })).toEqual([]);
		expect(drawHoles({ type: 'Polygon', coordinates: [closed(BLOCK)] })).toEqual([]);
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

/**
 * Which edge a click on the boundary lands on. The map settles that the pointer
 * is on the shape; this settles which of its edges was meant, and a wrong answer
 * puts the new vertex on the far side of the ring.
 */
describe('nearestRingEdge', () => {
	const SQUARE = [
		[0, 0],
		[0, 10],
		[10, 10],
		[10, 0],
	] as const;

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
		const hole = [
			[2, 2],
			[2, 4],
			[4, 4],
		] as const;

		expect(nearestRingEdge([SQUARE, hole], [2, 3], true)).toEqual({ ring: 1, vertex: 0 });
	});

	it('has no edge to name in an empty ring', () => {
		expect(nearestRingEdge([[]], [0, 0], true)).toBeNull();
	});
});

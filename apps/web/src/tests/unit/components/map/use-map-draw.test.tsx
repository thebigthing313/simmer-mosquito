// @vitest-environment jsdom
import type { OwnedGeometryKind } from '@simmer-mosquito/domain';
import { cleanup, fireEvent, screen } from '@testing-library/react';
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
import { cleanupRenderedHooks, createFakeMap, pressKey, pressKeyIn, renderHook } from './fake-map';
import {
	openMenu,
	openSelect,
	pressInEveryField,
	pressWatched,
	renderFocusedButton,
	renderMenu,
	renderSelect,
	selectTrigger,
} from './key-presses';

const SOURCE_ID = 'habitat-draw';
const LAYER_IDS = [
	'habitat-draw-fill',
	'habitat-draw-outline',
	'habitat-draw-line',
	'habitat-draw-vertex',
	'habitat-draw-point',
];

afterEach(cleanupRenderedHooks);
afterEach(cleanup);

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
	geometryKind,
}: {
	readonly map: MapboxMap;
	readonly initial: DrawGeometry | null;
	readonly geometryKind: OwnedGeometryKind;
}) {
	const [value, setValue] = useState<DrawGeometry | null>(initial);
	return {
		value,
		draw: useMapDraw({ map, isLoaded: true, value, onChange: setValue, geometryKind }),
	};
}

/**
 * A habitat by default, which is one of the five kinds that store every shape,
 * so nothing here is refused for the record's sake unless the case says so.
 */
function mountControlled(
	initial: DrawGeometry | null = null,
	geometryKind: OwnedGeometryKind = 'habitat',
) {
	const fake = createFakeMap();
	return { fake, ...renderHook(useControlledDraw, { map: fake.map, initial, geometryKind }) };
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

/**
 * A line crossing {@link BLOCK}'s northern edge twice, drawn north of it, and
 * the same line reflected about that edge.
 *
 * One reshape gesture in both directions: outside the piece it pushes the edge
 * out to 38, inside it pulls the edge in to 36. Both cross at -90.5 and -89.5,
 * so the two results differ only in which side of the edge the line ran.
 */
const OUTSIDE_SKETCH = [
	[-90.5, 36],
	[-90.5, 38],
	[-89.5, 38],
	[-89.5, 36],
] as const;
const INSIDE_SKETCH = [
	[-90.5, 38],
	[-90.5, 36],
	[-89.5, 36],
	[-89.5, 38],
] as const;
/** {@link BLOCK} with {@link OUTSIDE_SKETCH} taken into its northern edge. */
const BULGED_BLOCK = [
	[-90.5, 37],
	[-90.5, 38],
	[-89.5, 38],
	[-89.5, 37],
	[-88, 37],
	[-88, 34],
	[-91, 34],
	[-91, 37],
] as const;
/** {@link BLOCK} with {@link INSIDE_SKETCH} taken into its northern edge. */
const NOTCHED_BLOCK = [
	[-90.5, 37],
	[-90.5, 36],
	[-89.5, 36],
	[-89.5, 37],
	[-88, 37],
	[-88, 34],
	[-91, 34],
	[-91, 37],
] as const;

/** A line straight down the middle of {@link BLOCK}, out both sides. */
const ACROSS_BLOCK = [
	[-89.5, 33],
	[-89.5, 38],
] as const;
/** The two halves {@link ACROSS_BLOCK} leaves, wound the way the block was. */
const WEST_HALF = [
	[-89.5, 34],
	[-91, 34],
	[-91, 37],
	[-89.5, 37],
] as const;
const EAST_HALF = [
	[-89.5, 37],
	[-88, 37],
	[-88, 34],
	[-89.5, 34],
] as const;

/** Open the first piece, start a reshape, and trace `line` over the map. */
function sketchOver(
	fake: FakeMap,
	result: ControlledHarness['result'],
	line: readonly (readonly [number, number])[],
): void {
	traceOver(fake, result, line, 0, false);
}

/** The same for Split, on the piece at `index`. */
function splitOver(
	fake: FakeMap,
	result: ControlledHarness['result'],
	line: readonly (readonly [number, number])[],
	index = 0,
): void {
	traceOver(fake, result, line, index, true);
}

function traceOver(
	fake: FakeMap,
	result: ControlledHarness['result'],
	line: readonly (readonly [number, number])[],
	index: number,
	splitting: boolean,
): void {
	act(() => {
		result.current.draw.editPart(index);
	});
	act(() => {
		if (splitting) {
			result.current.draw.startSplit();
		} else {
			result.current.draw.startReshape();
		}
	});
	for (const [longitude, latitude] of line) {
		act(() => {
			fake.click(longitude, latitude);
		});
	}
}

/**
 * Land the reshape line, then commit the piece.
 *
 * Finish means both, in that order: the reshaped outline is still a draft the
 * vertex gestures can work on, so the press that lands the line is not the press
 * that puts the piece back.
 */
function finishReshape(result: ControlledHarness['result']): void {
	act(() => {
		result.current.draw.finish();
	});
	act(() => {
		result.current.draw.finish();
	});
}

/** Click a ring's corners onto the map, leaving the draft open. */
function placeVertices(fake: FakeMap, ring: readonly (readonly [number, number])[]): void {
	for (const [longitude, latitude] of ring) {
		act(() => {
			fake.click(longitude, latitude);
		});
	}
}

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
	placeVertices(fake, ring);
	act(() => {
		result.current.draw.finish();
	});
}

/** How far along the open draft is, in the terms a stray key would move. */
function draftState(result: ControlledHarness['result']) {
	return {
		value: result.current.value,
		isDrawing: result.current.draw.isDrawing,
		canFinish: result.current.draw.canFinish,
		vertexCount: result.current.draw.vertexCount,
		sketchVertices: result.current.draw.editedPart?.sketch?.vertices ?? null,
	};
}

/**
 * A draft of every kind Enter and Escape land in, each opened and left one press
 * from finished.
 *
 * All five reach Finish through one handler and Cancel through the one below it,
 * so each guard is one condition. They are all here because a mode that stopped
 * reaching that handler is exactly what would put the bug back, and nothing else
 * would say so.
 */
const OPEN_DRAFTS = [
	{
		name: 'draw',
		open: (fake: FakeMap, result: ControlledHarness['result']) => {
			act(() => {
				result.current.draw.start('Polygon');
			});
			placeVertices(fake, FIRST_SQUARE);
		},
	},
	{
		name: 'hole',
		open: (fake: FakeMap, result: ControlledHarness['result']) => {
			drawPolygon(fake, result, BLOCK);
			act(() => {
				result.current.draw.startHole(0);
			});
			placeVertices(fake, POND);
		},
	},
	{
		name: 'continuation',
		open: (fake: FakeMap, result: ControlledHarness['result']) => {
			drawPolygon(fake, result, BLOCK);
			act(() => {
				result.current.draw.continuePart(0);
			});
			placeVertices(fake, [[-89, 33]]);
		},
	},
	{
		name: 'edit',
		open: (fake: FakeMap, result: ControlledHarness['result']) => {
			drawPolygon(fake, result, BLOCK);
			act(() => {
				result.current.draw.editPart(0);
			});
		},
	},
	{
		name: 'sketch',
		open: (fake: FakeMap, result: ControlledHarness['result']) => {
			drawPolygon(fake, result, BLOCK);
			sketchOver(fake, result, OUTSIDE_SKETCH);
		},
	},
];

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

	it('finishes the shape on an Enter the map got', () => {
		const { fake, result } = mountControlled();

		act(() => {
			result.current.draw.start('Polygon');
		});
		placeVertices(fake, FIRST_SQUARE);
		pressKey('Enter');

		expect(result.current.draw.isDrawing).toBe(false);
		expect(result.current.value).toEqual({
			type: 'Polygon',
			coordinates: [closed(FIRST_SQUARE)],
		});
	});

	// The canvas is the map's key surface, and it carries no role and spends no
	// default, so it is what the rule has to recognise positively. Pressed in the
	// real canvas rather than a stand-in `div`, because being that element is now
	// the whole of why the press counts.
	it('finishes the shape on an Enter the map canvas got', () => {
		const { fake, result } = mountControlled();

		act(() => {
			result.current.draw.start('Polygon');
		});
		placeVertices(fake, FIRST_SQUARE);
		pressKeyIn(fake.canvas, 'Enter');

		expect(result.current.draw.isDrawing).toBe(false);
		expect(result.current.value).toEqual({
			type: 'Polygon',
			coordinates: [closed(FIRST_SQUARE)],
		});
	});

	/**
	 * The draft takes the canvas when it opens, which is what makes the surface
	 * rule cost nothing.
	 *
	 * Every opener is a button somewhere else on the page, so without this a user
	 * who clicked Draw and then pressed Escape would be pressing it on that
	 * button. The canvas is mapbox's own focus target and the element its
	 * arrow-key panning already needs focused, so nothing new becomes focusable.
	 */
	it.each(OPEN_DRAFTS)('hands the map canvas focus when an open $name starts', ({ open }) => {
		const { fake, result } = mountControlled();

		open(fake, result);

		expect(document.activeElement).toBe(fake.canvas);
	});

	// Placing a corner keeps the canvas focused rather than taking focus back on
	// every mode change, because an edit changes mode on every drag and a user
	// who moved to a field mid-draft would lose the caret.
	it('leaves focus where the user put it once the draft is open', () => {
		const { fake, result } = mountControlled();
		const field = document.createElement('input');
		document.body.append(field);

		act(() => {
			result.current.draw.start('Polygon');
		});
		field.focus();
		placeVertices(fake, FIRST_SQUARE);

		expect(document.activeElement).toBe(field);
		field.remove();
	});

	// The panel beside the map stays live while a draft is open, so Enter has to
	// tell a finished shape from a filled-in description. A field is never inside
	// the map's key surface, which is the one reason all of these cases pass.
	it.each(OPEN_DRAFTS)('leaves an open $name alone when Enter came from a field', ({ open }) => {
		const { fake, result } = mountControlled();

		open(fake, result);
		const before = draftState(result);
		expect(before.canFinish).toBe(true);

		pressInEveryField('Enter');

		expect(draftState(result)).toEqual(before);
	});

	// Escape throws the draft away rather than keeping the shape, so an
	// unguarded press costs the boundary the user just walked. It is also the key
	// a select or a popover beside the map is dismissed with, which is the case
	// below this one.
	it.each(OPEN_DRAFTS)('leaves an open $name alone when Escape came from a field', ({ open }) => {
		const { fake, result } = mountControlled();

		open(fake, result);
		const before = draftState(result);
		expect(before.canFinish).toBe(true);

		pressInEveryField('Escape');

		expect(draftState(result)).toEqual(before);
	});

	/**
	 * The overlay half, which no reading of the focused element answers.
	 *
	 * Radix's `DismissableLayer` listens on the document in the capture phase,
	 * calls `preventDefault`, dismisses, and does not stop propagation, so an
	 * Escape that closed a select still reaches this listener, on the listbox's
	 * own `div[role="option"]`, which is no field.
	 *
	 * The select here is the real one from `ui-web`, opened the way a user opens
	 * it, because the whole point is what Radix does rather than what it is
	 * documented to do. A version that stopped spending the Escape while still
	 * letting the key through is the regression this catches, and the surface
	 * rule catches it whether the flag is set or not.
	 */
	it('leaves the draft alone when Escape dismissed an open select', async () => {
		const { fake, result } = mountControlled();

		renderSelect();
		act(() => {
			result.current.draw.start('Polygon');
		});
		placeVertices(fake, FIRST_SQUARE);
		const before = draftState(result);

		const option = await openSelect();
		const seen = pressWatched(option, 'Escape', fake.canvasContainer);

		expect(seen.reachedWindow).toBe(true);
		expect(seen.onMapSurface).toBe(false);
		expect(draftState(result)).toEqual(before);
	});

	/**
	 * Choosing a value, which arrives with nothing in the event to hold against
	 * it.
	 *
	 * Radix's select item calls `preventDefault` for Space alone, to stop the
	 * page scrolling. Enter has no default worth cancelling on a `div`, so the
	 * press that picks a value arrives with the flag clear, on a target that is
	 * no field. The case asserts the flag was clear so it cannot start passing
	 * for the dismissal's reason instead of its own.
	 */
	it.each(OPEN_DRAFTS)('leaves an open $name alone when Enter chose a value from a select', async ({
		open,
	}) => {
		const { fake, result } = mountControlled();

		renderSelect();
		open(fake, result);
		const before = draftState(result);
		expect(before.canFinish).toBe(true);

		const option = await openSelect();
		const seen = pressWatched(option, 'Enter', fake.canvasContainer);

		expect(seen.reachedWindow).toBe(true);
		expect(seen.defaultPrevented).toBe(false);
		expect(seen.onMapSurface).toBe(false);
		expect(draftState(result)).toEqual(before);
	});

	/**
	 * #572, and the press that ended the run of guards.
	 *
	 * A `<button>` beside the map is what the location panel is made of: the
	 * pickers in `entity-picker.tsx` and `region-boundary-picker.tsx`, and the
	 * draw toolbar's own Undo, Cancel and Delete vertex. Enter on a focused one
	 * fires the button's click as the keypress's default action, so nothing
	 * calls `preventDefault`, and a `<button>` declares no ARIA role because it
	 * already is one. The map canvas is role-less and unprevented too, which is
	 * why the case asserts both: nothing in this event tells the two apart, and
	 * only where it landed does.
	 */
	it.each(OPEN_DRAFTS)('leaves an open $name alone when Enter activated a button beside the map', ({
		open,
	}) => {
		const { fake, result } = mountControlled();

		open(fake, result);
		const before = draftState(result);
		expect(before.canFinish).toBe(true);

		const seen = pressWatched(renderFocusedButton(), 'Enter', fake.canvasContainer);

		expect(seen.reachedWindow).toBe(true);
		expect(seen.defaultPrevented).toBe(false);
		expect(seen.role).toBeNull();
		expect(seen.onMapSurface).toBe(false);
		expect(draftState(result)).toEqual(before);
	});

	// The worse half of #572, in the arm below it. Escape on a focused button
	// beside the map threw the whole draft away, and the draw toolbar's own
	// Cancel, Undo and Delete vertex are the buttons closest to hand.
	it.each(OPEN_DRAFTS)('leaves an open $name alone when Escape came from a button', ({ open }) => {
		const { fake, result } = mountControlled();

		open(fake, result);
		const before = draftState(result);
		expect(before.canFinish).toBe(true);

		const seen = pressWatched(renderFocusedButton(), 'Escape', fake.canvasContainer);

		expect(seen.reachedWindow).toBe(true);
		expect(seen.defaultPrevented).toBe(false);
		expect(draftState(result)).toEqual(before);
	});

	/**
	 * The same press one element further in, which is why the rule reads the
	 * canvas container rather than the whole map.
	 *
	 * Mapbox builds a control container beside the canvas one and puts its
	 * attribution and info buttons in it. Those are inside `getContainer()`, so a
	 * rule written against the map as a whole would finish the shape on an Enter
	 * that opened the attribution list.
	 */
	it.each(OPEN_DRAFTS)("leaves an open $name alone when Enter hit mapbox's own button", ({
		open,
	}) => {
		const { fake, result } = mountControlled();

		open(fake, result);
		const before = draftState(result);
		expect(before.canFinish).toBe(true);

		fake.attributionButton.focus();
		const seen = pressWatched(fake.attributionButton, 'Enter', fake.canvasContainer);

		expect(seen.reachedWindow).toBe(true);
		expect(fake.container.contains(fake.attributionButton)).toBe(true);
		expect(seen.onMapSurface).toBe(false);
		expect(draftState(result)).toEqual(before);
	});

	/**
	 * An open menu, where the press lands on the menu itself rather than an item.
	 *
	 * Opened with the pointer, Radix focuses the content, so `event.target` is
	 * `div[role="menu"]` and not one of the `menuitem` roles. Enter there does
	 * nothing to the menu and arrives with the flag clear, which is a fourth
	 * shape a rule about where the key must not have come from has to enumerate
	 * and the surface rule does not.
	 */
	it.each(OPEN_DRAFTS)('leaves an open $name alone when Enter came from an open menu', async ({
		open,
	}) => {
		const { fake, result } = mountControlled();

		renderMenu();
		open(fake, result);
		const before = draftState(result);
		expect(before.canFinish).toBe(true);

		const seen = pressWatched(await openMenu(), 'Enter', fake.canvasContainer);

		expect(seen.reachedWindow).toBe(true);
		expect(seen.defaultPrevented).toBe(false);
		expect(seen.role).toBe('menu');
		expect(draftState(result)).toEqual(before);
	});

	// The other half of the same press, one key earlier. The trigger spends the
	// Enter that opens it, the way `DismissableLayer` spends the Escape that
	// closes it, so this is the `defaultPrevented` guard rather than the role one.
	it.each(OPEN_DRAFTS)('leaves an open $name alone when Enter opened a select', async ({
		open,
	}) => {
		const { fake, result } = mountControlled();

		renderSelect();
		open(fake, result);
		const before = draftState(result);
		const trigger = selectTrigger();
		trigger.focus();

		act(() => {
			fireEvent.keyDown(trigger, { key: 'Enter' });
		});
		await screen.findByText('Pond');

		expect(draftState(result)).toEqual(before);
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

	// #472: the form reads any publication as a redraw, and on a habitat that
	// names `updateHabitatLocation`, which a collector may not send. A finish that
	// placed no corner has nothing to report.
	it('reports nothing when a continuation finishes on the corners it opened with', () => {
		const { onChange, result } = mount({ type: 'Polygon', coordinates: [closed(FIRST_SQUARE)] });

		act(() => {
			result.current.continuePart(0);
		});
		expect(result.current.vertexCount).toBe(3);
		act(() => {
			result.current.finish();
		});

		expect(onChange).not.toHaveBeenCalled();
		expect(result.current.isDrawing).toBe(false);
		expect(result.current.vertexCount).toBe(0);
	});

	// The guard is on the commit rather than on the continuation, so every gesture
	// that puts a piece back reads it. An edit opened and finished with nothing
	// moved is the same shape arriving by the path reshape and split land on.
	it('reports nothing when an edit finishes on the piece it opened', () => {
		const { onChange, result } = mount({ type: 'Polygon', coordinates: [closed(BLOCK)] });

		act(() => {
			result.current.editPart(0);
		});
		act(() => {
			result.current.finish();
		});

		expect(onChange).not.toHaveBeenCalled();
		expect(result.current.isDrawing).toBe(false);
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
			sketch: null,
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

	// Every case above this one calls `deleteVertex`, so nothing had ever pressed
	// the key that calls it. Both keys, because a laptop keyboard often has only
	// Backspace and the arm takes either.
	it.each(['Delete', 'Backspace'])('takes the picked corner off on a %s the map got', (key) => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		act(() => {
			result.current.draw.editPart(0);
		});
		act(() => {
			result.current.draw.selectVertex({ ring: 0, vertex: 1 });
		});

		pressKey(key);

		expect(result.current.draw.editedPart?.selected).toBeNull();
		expect(result.current.draw.vertexCount).toBe(3);
	});

	// The guard the Enter and Escape arms were modelled on, and the one that had
	// never been pressed: a backspace meant for a description would otherwise take
	// a corner off the shape.
	it.each([
		'Delete',
		'Backspace',
	])('leaves the picked corner alone when %s came from a field', (key) => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		act(() => {
			result.current.draw.editPart(0);
		});
		act(() => {
			result.current.draw.selectVertex({ ring: 0, vertex: 1 });
		});

		pressInEveryField(key);

		expect(result.current.draw.editedPart?.selected).toEqual({ ring: 0, vertex: 1 });
		expect(result.current.draw.vertexCount).toBe(4);
	});

	/**
	 * #573, the same hole in the arm that deletes rather than the one that
	 * finishes.
	 *
	 * A select open beside the map focuses its own `div[role="option"]`. That is
	 * no field, and Radix's typeahead does not spend Delete or Backspace, so the
	 * press arrived here with nothing on it to hold against it and took a corner
	 * off the shape. Only Delete reaches this arm, so there is one mode rather
	 * than five: a draw, a hole and a continuation have no picked vertex, and a
	 * sketch turns the pick off.
	 */
	it.each([
		'Delete',
		'Backspace',
	])('leaves the picked corner alone when %s came from an open select', async (key) => {
		const { fake, result } = mountControlled();

		renderSelect();
		drawPolygon(fake, result, BLOCK);
		act(() => {
			result.current.draw.editPart(0);
		});
		act(() => {
			result.current.draw.selectVertex({ ring: 0, vertex: 1 });
		});

		const option = await openSelect();
		const seen = pressWatched(option, key, fake.canvasContainer);

		expect(seen.reachedWindow).toBe(true);
		expect(seen.defaultPrevented).toBe(false);
		expect(seen.role).toBe('option');
		expect(result.current.draw.editedPart?.selected).toEqual({ ring: 0, vertex: 1 });
		expect(result.current.draw.vertexCount).toBe(4);
	});

	// #572's shape in the Delete arm. The toolbar's own Delete vertex button is a
	// focused `<button>` beside the map, and a Backspace pressed on it used to
	// take a second corner off.
	it.each([
		'Delete',
		'Backspace',
	])('leaves the picked corner alone when %s came from a button', (key) => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		act(() => {
			result.current.draw.editPart(0);
		});
		act(() => {
			result.current.draw.selectVertex({ ring: 0, vertex: 1 });
		});

		const seen = pressWatched(renderFocusedButton('Delete vertex'), key, fake.canvasContainer);

		expect(seen.reachedWindow).toBe(true);
		expect(seen.role).toBeNull();
		expect(seen.onMapSurface).toBe(false);
		expect(result.current.draw.editedPart?.selected).toEqual({ ring: 0, vertex: 1 });
		expect(result.current.draw.vertexCount).toBe(4);
	});

	// The other side of the same rule: the canvas is where a Delete still lands.
	it.each([
		'Delete',
		'Backspace',
	])('takes the picked corner off on a %s the map canvas got', (key) => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		act(() => {
			result.current.draw.editPart(0);
		});
		act(() => {
			result.current.draw.selectVertex({ ring: 0, vertex: 1 });
		});

		pressKeyIn(fake.canvas, key);

		expect(result.current.draw.editedPart?.selected).toBeNull();
		expect(result.current.draw.vertexCount).toBe(3);
	});

	it('extends a piece when the reshape line runs outside it', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		sketchOver(fake, result, OUTSIDE_SKETCH);
		finishReshape(result);

		expect(result.current.value).toEqual({
			type: 'Polygon',
			coordinates: [closed(BULGED_BLOCK)],
		});
	});

	// The same line reflected about the edge it crosses. Nothing in the gesture
	// says which of the two is meant: where the line runs is the whole answer.
	it('carves a piece away when the reshape line runs inside it', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		sketchOver(fake, result, INSIDE_SKETCH);
		finishReshape(result);

		expect(result.current.value).toEqual({
			type: 'Polygon',
			coordinates: [closed(NOTCHED_BLOCK)],
		});
	});

	// The line leaves the piece at -89.5 and comes back, so there are three
	// crossings. A rule stopping at the second would drop the last third of it.
	it('replaces the stretch between the first and last of several crossings', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		sketchOver(fake, result, [
			[-90.5, 38],
			[-90.5, 36],
			[-90, 36],
			[-90, 38],
			[-89.5, 38],
			[-89.5, 36],
		]);
		finishReshape(result);

		expect(result.current.value).toEqual({
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
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		sketchOver(fake, result, [
			[-90.5, 35],
			[-89.5, 35],
		]);

		expect(result.current.draw.editedPart?.problem).toBe('tooFewCrossings');
		expect(result.current.draw.canFinish).toBe(false);
		// Red on the map too, so the refusal is not only a greyed-out button.
		const refused = fake
			.featuresOf(SOURCE_ID)
			.filter((feature) => feature.properties?.refused === true);
		expect(refused.length).toBeGreaterThan(0);

		act(() => {
			result.current.draw.finish();
		});
		expect(result.current.value).toEqual({ type: 'Polygon', coordinates: [closed(BLOCK)] });
	});

	// A line that has not crossed anything yet is a draw in progress, the way one
	// vertex of a polygon is, so it must not paint the piece red.
	it('says nothing is wrong until the line has two vertices', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		act(() => {
			result.current.draw.editPart(0);
		});
		act(() => {
			result.current.draw.startReshape();
		});

		expect(result.current.draw.editedPart?.sketch?.vertices ?? null).toBe(0);
		expect(result.current.draw.editedPart?.problem).toBeNull();
		expect(result.current.draw.canFinish).toBe(false);
	});

	it('carries the holes of the piece it reshapes through untouched', () => {
		const { fake, result } = mountControlled({
			type: 'Polygon',
			coordinates: [closed(BLOCK), closed(POND)],
		});

		sketchOver(fake, result, OUTSIDE_SKETCH);
		finishReshape(result);

		expect(result.current.value).toEqual({
			type: 'Polygon',
			coordinates: [closed(BULGED_BLOCK), closed(POND)],
		});
	});

	// The same refusal a hole cut outside its piece reports, read from the other
	// end: here the outline moved rather than the hole.
	it('refuses a reshape that leaves a hole outside the piece', () => {
		const { fake, result } = mountControlled({
			type: 'Polygon',
			coordinates: [closed(BLOCK), closed(POND)],
		});

		sketchOver(fake, result, [
			[-92, 34.5],
			[-89.5, 34.5],
			[-89.5, 36.5],
			[-92, 36.5],
		]);

		expect(result.current.draw.editedPart?.problem).toBe('holesEscape');
		expect(result.current.draw.canFinish).toBe(false);
	});

	it('replaces the stretch of a line between its two crossings', () => {
		const { fake, result } = mountControlled({
			type: 'LineString',
			coordinates: [
				[-91, 35],
				[-90, 35],
				[-89, 35],
			],
		});

		sketchOver(fake, result, [
			[-90.5, 34],
			[-90.5, 36],
			[-89.5, 36],
			[-89.5, 34],
		]);
		finishReshape(result);

		expect(result.current.value).toEqual({
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
		act(() => {
			result.current.draw.startReshape();
		});

		expect(result.current.draw.editedPart?.sketch?.vertices ?? null).toBeNull();
	});

	it('leaves the other pieces alone and keeps the reshaped one at its index', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.startPart();
		});
		drawPolygon(fake, result, BLOCK);

		act(() => {
			result.current.draw.editPart(1);
		});
		expect(result.current.draw.editedPart?.partNumber).toBe(2);
		act(() => {
			result.current.draw.startReshape();
		});
		for (const [longitude, latitude] of OUTSIDE_SKETCH) {
			act(() => {
				fake.click(longitude, latitude);
			});
		}
		finishReshape(result);

		expect(result.current.value).toEqual({
			type: 'MultiPolygon',
			coordinates: [[closed(FIRST_SQUARE)], [closed(BULGED_BLOCK)]],
		});
	});

	it('leaves the committed piece as it was when a reshape is cancelled', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		sketchOver(fake, result, OUTSIDE_SKETCH);
		act(() => {
			result.current.draw.cancel();
		});

		expect(result.current.value).toEqual({ type: 'Polygon', coordinates: [closed(BLOCK)] });
		expect(result.current.draw.isDrawing).toBe(false);
	});

	// Undo unwinds the line one vertex at a time and closes an empty one, so a
	// sketch nobody wanted does not cost the whole edit.
	it('undoes a reshape line vertex by vertex and then closes it', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		sketchOver(fake, result, OUTSIDE_SKETCH);
		expect(result.current.draw.editedPart?.sketch?.vertices ?? null).toBe(4);

		for (let taken = 0; taken < 4; taken += 1) {
			act(() => {
				result.current.draw.undo();
			});
		}
		expect(result.current.draw.editedPart?.sketch?.vertices ?? null).toBe(0);
		expect(result.current.draw.canUndo).toBe(true);

		act(() => {
			result.current.draw.undo();
		});
		expect(result.current.draw.editedPart?.sketch?.vertices ?? null).toBeNull();
		expect(result.current.draw.canUndo).toBe(false);
	});

	// A landed reshape is one gesture, the way a moved vertex is, so Undo takes it
	// back whole and stops at the piece as it was opened.
	it('takes a landed reshape back in one step', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		sketchOver(fake, result, OUTSIDE_SKETCH);
		act(() => {
			result.current.draw.finish();
		});
		expect(result.current.draw.editedPart?.sketch?.vertices ?? null).toBeNull();

		act(() => {
			result.current.draw.undo();
		});
		expect(result.current.draw.canUndo).toBe(false);
		act(() => {
			result.current.draw.finish();
		});

		expect(result.current.value).toEqual({ type: 'Polygon', coordinates: [closed(BLOCK)] });
	});

	// The toolbar tells the user to double-click, so the gesture has to be the one
	// a browser sends: two clicks and then `dblclick`. The repeated last vertex is
	// dropped, which is why the result is the one a single click gives.
	it('lands the reshape line on a double-click', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		act(() => {
			result.current.draw.editPart(0);
		});
		act(() => {
			result.current.draw.startReshape();
		});
		for (const [longitude, latitude] of OUTSIDE_SKETCH.slice(0, -1)) {
			act(() => {
				fake.click(longitude, latitude);
			});
		}
		const [longitude, latitude] = OUTSIDE_SKETCH[OUTSIDE_SKETCH.length - 1] ?? [0, 0];
		act(() => {
			fake.doubleClick(longitude, latitude);
		});

		expect(result.current.draw.editedPart?.sketch?.vertices ?? null).toBeNull();
		act(() => {
			result.current.draw.finish();
		});
		expect(result.current.value).toEqual({
			type: 'Polygon',
			coordinates: [closed(BULGED_BLOCK)],
		});
	});

	// A line drawn out of the piece and straight back over itself replaces the
	// whole stretch with a line, which is an outline of two corners. Refused by
	// the same rule that refuses a vertex deleted below the minimum.
	it('refuses a reshape that folds the outline back on itself', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		sketchOver(fake, result, [
			[-90, 33],
			[-90, 38],
			[-90, 33],
		]);

		expect(result.current.draw.editedPart?.problem).toBe('tooFewVertices');
		expect(result.current.draw.canFinish).toBe(false);
		act(() => {
			result.current.draw.finish();
		});
		expect(result.current.value).toEqual({ type: 'Polygon', coordinates: [closed(BLOCK)] });
	});

	// Three corners on one line are three corners and no area. #495 refused it
	// with nothing to call it; the reshape vocabulary gave the refusal a name, so
	// the message under the button and the red on the map are one answer.
	it('names an edit that leaves the outline enclosing nothing', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, FIRST_SQUARE);
		act(() => {
			result.current.draw.editPart(0);
		});
		act(() => {
			result.current.draw.moveVertex({ ring: 0, vertex: 2 }, [-90, 37]);
		});

		expect(result.current.draw.editedPart?.problem).toBe('coversNoGround');
		expect(result.current.draw.canFinish).toBe(false);
	});

	// Half the block each way, from one line drawn clean across it. Both halves
	// keep the winding the block arrived with, so neither is flipped on the way
	// into the part list.
	it('cuts a piece in two along the split line', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		splitOver(fake, result, ACROSS_BLOCK);
		act(() => {
			result.current.draw.finish();
		});

		expect(result.current.value).toEqual({
			type: 'MultiPolygon',
			coordinates: [[closed(WEST_HALF)], [closed(EAST_HALF)]],
		});
	});

	it('gives a hole the line misses to the piece that holds it', () => {
		const { fake, result } = mountControlled({
			type: 'Polygon',
			coordinates: [closed(BLOCK), closed(POND)],
		});

		splitOver(fake, result, [
			[-88.5, 33],
			[-88.5, 38],
		]);
		act(() => {
			result.current.draw.finish();
		});

		expect(result.current.value).toEqual({
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

	/**
	 * The pond straddles the line, so it stops being a hole: each half of its ring
	 * becomes part of the outline of one piece. Both pieces come back with one
	 * ring, which is what PostGIS would have made of the same cut.
	 *
	 * The coordinates are pinned in the corpus in `packages/mapping`. What this
	 * case owns is that the shape reaching the record is a two-piece MultiPolygon
	 * with no hole left anywhere in it.
	 */
	it('turns a hole the line crosses into the boundary of both pieces', () => {
		const { fake, result } = mountControlled({
			type: 'Polygon',
			coordinates: [closed(BLOCK), closed(POND)],
		});

		splitOver(fake, result, ACROSS_BLOCK);
		act(() => {
			result.current.draw.finish();
		});

		const parts = drawParts(result.current.value);
		expect(parts).toHaveLength(2);
		expect(parts.map(drawHoles)).toEqual([[], []]);
		expect(result.current.value?.type).toBe('MultiPolygon');
	});

	it('cuts a line in two at the place the split line crosses it', () => {
		const { fake, result } = mountControlled({
			type: 'LineString',
			coordinates: [
				[-91, 35],
				[-90, 35],
				[-89, 35],
			],
		});

		splitOver(fake, result, [
			[-89.5, 34],
			[-89.5, 36],
		]);
		act(() => {
			result.current.draw.finish();
		});

		expect(result.current.value).toEqual({
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
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		act(() => {
			result.current.draw.startPart();
		});
		drawPolygon(fake, result, SECOND_SQUARE);
		splitOver(fake, result, ACROSS_BLOCK);
		act(() => {
			result.current.draw.finish();
		});

		expect(result.current.value).toEqual({
			type: 'MultiPolygon',
			coordinates: [[closed(WEST_HALF)], [closed(EAST_HALF)], [closed(SECOND_SQUARE)]],
		});
	});

	it('says nothing is wrong until the split line has two vertices', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		act(() => {
			result.current.draw.editPart(0);
		});
		act(() => {
			result.current.draw.startSplit();
		});

		expect(result.current.draw.editedPart?.sketch).toEqual({ tool: 'split', vertices: 0 });
		expect(result.current.draw.editedPart?.problem).toBeNull();
		expect(result.current.draw.canFinish).toBe(false);
	});

	// A line that stops inside leaves one piece with a slit down it, which is not
	// a cut and is not something the part list could hold.
	it('refuses a split line that does not come out the other side', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		splitOver(fake, result, [
			[-89.5, 33],
			[-89.5, 35],
		]);

		expect(result.current.draw.editedPart?.problem).toBe('doesNotDivide');
		expect(result.current.draw.canFinish).toBe(false);
		act(() => {
			result.current.draw.finish();
		});
		expect(result.current.value).toEqual({ type: 'Polygon', coordinates: [closed(BLOCK)] });
	});

	/**
	 * A Notification Registration stores a Point or a Polygon and neither multi
	 * shape, so the second half of a cut has nowhere to go. Read off
	 * `OWNED_GEOMETRY_POLICIES` rather than named here, and refused before the
	 * first click because no line will make it false.
	 */
	it('refuses a split on a record that cannot store a second piece', () => {
		const { fake, result } = mountControlled(null, 'notificationRegistration');

		drawPolygon(fake, result, BLOCK);
		splitOver(fake, result, ACROSS_BLOCK);

		expect(result.current.draw.editedPart?.problem).toBe('cannotHoldParts');
		expect(result.current.draw.canFinish).toBe(false);
		act(() => {
			result.current.draw.finish();
		});
		expect(result.current.value).toEqual({ type: 'Polygon', coordinates: [closed(BLOCK)] });
	});

	it('leaves the committed piece as it was when a split is cancelled', () => {
		const { fake, result } = mountControlled();

		drawPolygon(fake, result, BLOCK);
		splitOver(fake, result, ACROSS_BLOCK);
		act(() => {
			result.current.draw.cancel();
		});

		expect(result.current.value).toEqual({ type: 'Polygon', coordinates: [closed(BLOCK)] });
		expect(result.current.draw.editedPart).toBeNull();
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

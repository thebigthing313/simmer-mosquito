// @vitest-environment jsdom
import type { OwnedGeometryKind } from '@simmer-mosquito/domain';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { act, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DrawGeometry } from '../../../../hooks/map/use-map-draw';
import { useMapDraw } from '../../../../hooks/map/use-map-draw';
import type { FakeMap } from '../../components/map/fake-map';
import {
	cleanupRenderedHooks,
	createFakeMap,
	pressKey,
	pressKeyIn,
	renderHook,
} from '../../components/map/fake-map';
import {
	openMenu,
	openSelect,
	pressInEveryField,
	pressWatched,
	renderFocusedButton,
	renderMenu,
	renderSelect,
	selectTrigger,
} from '../../components/map/key-presses';

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
/** A line crossing {@link BLOCK}'s northern edge twice, drawn north of it. */
const OUTSIDE_SKETCH = [
	[-90.5, 36],
	[-90.5, 38],
	[-89.5, 38],
	[-89.5, 36],
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

/** Open the first piece, start a reshape, and trace `line` over the map. */
function sketchOver(
	fake: FakeMap,
	result: ControlledHarness['result'],
	line: readonly (readonly [number, number])[],
): void {
	act(() => {
		result.current.draw.editPart(0);
	});
	act(() => {
		result.current.draw.startReshape();
	});
	placeVertices(fake, line);
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

		const seen = pressWatched(renderFocusedButton('Delete Vertex'), key, fake.canvasContainer);

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

	// Escape is the Cancel control on the map, so it rejects a pending request
	// as cancelled, the way the control does, and not as superseded.
	it('cancels a requested point on an Escape the map got', async () => {
		const { result } = mount();

		let pending: Promise<unknown> | null = null;
		act(() => {
			pending = result.current.requestPoint();
		});
		pressKey('Escape');

		await expect(pending).rejects.toThrow('Point selection cancelled.');
		expect(result.current.isRequestingPoint).toBe(false);
	});
});

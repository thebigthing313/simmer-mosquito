// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { Map as MapboxMap } from 'mapbox-gl';
import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { MapMeasureController } from '../../../../components/map/use-map-measure';
import { useMapMeasure } from '../../../../components/map/use-map-measure';
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

const SOURCE_ID = 'map-measure';
const LAYER_IDS = [
	'map-measure-fill',
	'map-measure-outline',
	'map-measure-line',
	'map-measure-vertex',
];

afterEach(cleanupRenderedHooks);
afterEach(cleanup);

function mount() {
	const fake = createFakeMap();
	let renders = 0;
	const harness = renderHook(
		(props: { readonly map: MapboxMap | null; readonly isLoaded: boolean }) => {
			renders += 1;
			return useMapMeasure(props);
		},
		{ map: fake.map, isLoaded: true },
	);
	return { fake, renders: () => renders, ...harness };
}

/** Roles carried by the features the measure source is holding, in order. */
function roles(fake: FakeMap): (string | undefined)[] {
	return fake.featuresOf(SOURCE_ID).map((feature) => feature.properties?.role);
}

/** The outer ring of a polygon feature, for asserting how far a shape reaches. */
function cornersOf(feature: GeoJSON.Feature | undefined): GeoJSON.Position[] {
	return feature?.geometry.type === 'Polygon' ? (feature.geometry.coordinates[0] ?? []) : [];
}

type MeasureResult = { readonly current: MapMeasureController };

/** Where the session stands, in the terms a stray key would move it. */
function sessionState(result: MeasureResult) {
	return {
		tool: result.current.tool,
		measurements: result.current.measurements,
		draftPointCount: result.current.draftPointCount,
		draft: result.current.draft.get(),
	};
}

/**
 * A measurement of each tool, left one press from finished.
 *
 * Three, not the five the draw session has: measure carries one draft at a
 * time and no edit or hole to open one from. A line is left with two points
 * placed, and the two-corner tools with an anchor down and the cursor out,
 * which is the state Enter commits and Escape throws away.
 */
const OPEN_DRAFTS = [
	{
		name: 'line',
		open: (fake: FakeMap, result: MeasureResult) => {
			act(() => {
				result.current.selectTool('distance');
			});
			act(() => {
				fake.click(-90, 35);
			});
			act(() => {
				fake.click(-90, 36);
			});
		},
	},
	{
		name: 'rectangle',
		open: (fake: FakeMap, result: MeasureResult) => {
			act(() => {
				result.current.selectTool('rectangle');
			});
			act(() => {
				fake.click(-90, 35);
			});
			act(() => {
				fake.move(-89, 36);
			});
		},
	},
	{
		name: 'circle',
		open: (fake: FakeMap, result: MeasureResult) => {
			act(() => {
				result.current.selectTool('circle');
			});
			act(() => {
				fake.click(-90, 35);
			});
			act(() => {
				fake.move(-90, 36);
			});
		},
	},
];

describe('useMapMeasure', () => {
	it('adds the measure source and its layers in order', () => {
		const { fake } = mount();

		expect(fake.sources.has(SOURCE_ID)).toBe(true);
		expect([...fake.layers.keys()]).toEqual(LAYER_IDS);
	});

	it('waits for the map to report itself loaded', () => {
		const fake = createFakeMap();
		renderHook(useMapMeasure, { map: fake.map, isLoaded: false });

		expect(fake.sources.size).toBe(0);
		expect(fake.layers.size).toBe(0);
	});

	it('measures a line across two clicks', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('distance');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-90, 36);
		});

		expect(result.current.draftPointCount).toBe(2);

		act(() => {
			result.current.finish();
		});

		expect(result.current.measurements).toHaveLength(1);
		const [measurement] = result.current.measurements;
		expect(measurement?.tool).toBe('distance');
		// One degree of latitude, near enough.
		expect(measurement?.lengthMeters).toBeGreaterThan(110_000);
		expect(measurement?.areaMeters).toBe(0);
		expect(roles(fake)).toEqual(['shape']);
	});

	it('closes a rectangle on the second click and reports its area', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('rectangle');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-89, 36);
		});

		expect(result.current.measurements).toHaveLength(1);
		expect(result.current.measurements[0]?.areaMeters).toBeGreaterThan(0);
		expect(result.current.measurements[0]?.radiusMeters).toBeNull();
	});

	it('measures a circle by its radius', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('circle');
		});
		// The first click anchors the centre; the second sets the radius.
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-90, 36);
		});

		expect(result.current.measurements).toHaveLength(1);
		expect(result.current.measurements[0]?.radiusMeters).toBeGreaterThan(110_000);
		expect(result.current.measurements[0]?.areaMeters).toBeGreaterThan(0);
	});

	it('previews the shape in progress before it is committed', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('distance');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.move(-90, 36);
		});

		// The rubber-band line plus the one placed point.
		expect(roles(fake)).toEqual(['draft', 'vertex']);
		const [line] = fake.featuresOf(SOURCE_ID);
		expect(line?.geometry).toEqual({
			type: 'LineString',
			coordinates: [
				[-90, 35],
				[-90, 36],
			],
		});
	});

	// The readout is the whole point of dragging a circle out, and it used to sit
	// at zero for the entire drag: it was derived at render time from a cursor
	// that deliberately does not cause renders.
	it('measures the shape in progress as it moves', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('circle');
		});
		act(() => {
			fake.click(-90, 35);
		});

		expect(result.current.draft.get()?.radiusMeters).toBe(0);

		act(() => {
			fake.move(-90, 35.5);
		});
		const halfway = result.current.draft.get()?.radiusMeters ?? 0;
		act(() => {
			fake.move(-90, 36);
		});

		expect(halfway).toBeGreaterThan(50_000);
		expect(result.current.draft.get()?.radiusMeters).toBeGreaterThan(halfway);
	});

	it('grows a line in progress towards the cursor', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('distance');
		});
		act(() => {
			fake.click(-90, 35);
		});

		// One point and no cursor is not yet a distance.
		expect(result.current.draft.get()).toBeNull();

		act(() => {
			fake.move(-90, 36);
		});

		expect(result.current.draft.get()?.lengthMeters).toBeGreaterThan(110_000);
	});

	// The cursor stays out of state so that the map does not re-render per frame.
	// The readout subscribes instead, which is what lets it move without dragging
	// everything else along.
	it('tells the readout about a move without re-rendering the map', () => {
		const { fake, result, renders } = mount();

		act(() => {
			result.current.selectTool('rectangle');
		});
		act(() => {
			fake.click(-90, 35);
		});

		const seen: number[] = [];
		const unsubscribe = result.current.draft.subscribe(() => {
			seen.push(result.current.draft.get()?.areaMeters ?? 0);
		});
		const before = renders();
		act(() => {
			fake.move(-89.5, 35.5);
			fake.move(-89, 36);
			// A move that lands nowhere new is not news.
			fake.move(-89, 36);
		});
		unsubscribe();

		expect(seen).toHaveLength(2);
		expect(seen[1]).toBeGreaterThan(seen[0] ?? 0);
		expect(renders()).toBe(before);
	});

	it('clears the readout when the shape is committed', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('rectangle');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.move(-89, 36);
		});
		expect(result.current.draft.get()).not.toBeNull();

		act(() => {
			fake.click(-89, 36);
		});

		expect(result.current.draft.get()).toBeNull();
		expect(result.current.measurements).toHaveLength(1);
	});

	it('drops the shape in progress on Escape and keeps the finished ones', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('rectangle');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-89, 36);
		});
		act(() => {
			result.current.selectTool('distance');
		});
		act(() => {
			fake.click(-91, 34);
		});
		pressKey('Escape');

		expect(result.current.measurements).toHaveLength(1);
		expect(roles(fake)).toEqual(['shape']);
	});

	/**
	 * #574, and the whole of why the surface rule is here.
	 *
	 * A measurement is taken while reading the panel or the form beside the map,
	 * which is where the stray press comes from. This handler had no guard at all,
	 * so every hole the draw session's four fixes found was open here at once.
	 *
	 * The cases below are the same set the draw suite runs, against a session
	 * with three tools rather than five modes. Each reports what reached
	 * `window`, so a case cannot start passing for another one's reason.
	 */
	it.each(OPEN_DRAFTS)('leaves an open $name alone when Enter came from a field', ({ open }) => {
		const { fake, result } = mount();

		open(fake, result);
		const before = sessionState(result);
		expect(before.draft).not.toBeNull();

		pressInEveryField('Enter');

		expect(sessionState(result)).toEqual(before);
	});

	// Escape throws the measurement away rather than keeping it, so a stray press
	// costs the line the user just walked. It is also the key a select or a
	// popover beside the map is dismissed with.
	it.each(OPEN_DRAFTS)('leaves an open $name alone when Escape came from a field', ({ open }) => {
		const { fake, result } = mount();

		open(fake, result);
		const before = sessionState(result);
		expect(before.draft).not.toBeNull();

		pressInEveryField('Escape');

		expect(sessionState(result)).toEqual(before);
	});

	/**
	 * The measure panel's own buttons are the closest to hand.
	 *
	 * `MeasureControl` keeps Undo point, Finish, Clear and the three tool buttons
	 * live for the whole session, so a user who has just clicked one is a focused
	 * `<button>` beside the map. Enter on it fires the button's click as the
	 * keypress's default action, so nothing spends the default, and a `<button>`
	 * declares no ARIA role because it already is one. The canvas is role-less
	 * and unprevented too, which is why the case asserts both.
	 */
	it.each(OPEN_DRAFTS)('leaves an open $name alone when Enter activated a button beside the map', ({
		open,
	}) => {
		const { fake, result } = mount();

		open(fake, result);
		const before = sessionState(result);
		expect(before.draft).not.toBeNull();

		const seen = pressWatched(renderFocusedButton('Undo point'), 'Enter', fake.canvasContainer);

		expect(seen.reachedWindow).toBe(true);
		expect(seen.defaultPrevented).toBe(false);
		expect(seen.role).toBeNull();
		expect(seen.onMapSurface).toBe(false);
		expect(sessionState(result)).toEqual(before);
	});

	it.each(OPEN_DRAFTS)('leaves an open $name alone when Escape came from a button', ({ open }) => {
		const { fake, result } = mount();

		open(fake, result);
		const before = sessionState(result);
		expect(before.draft).not.toBeNull();

		const seen = pressWatched(renderFocusedButton('Undo point'), 'Escape', fake.canvasContainer);

		expect(seen.reachedWindow).toBe(true);
		expect(seen.defaultPrevented).toBe(false);
		expect(sessionState(result)).toEqual(before);
	});

	/**
	 * Choosing a value, which arrives with nothing in the event to hold against
	 * it. Radix's select item spends the default for Space alone, so the Enter
	 * that picks a value reaches `window` with the flag clear on a target that is
	 * no field.
	 */
	it.each(OPEN_DRAFTS)('leaves an open $name alone when Enter chose a value from a select', async ({
		open,
	}) => {
		const { fake, result } = mount();

		renderSelect();
		open(fake, result);
		const before = sessionState(result);
		expect(before.draft).not.toBeNull();

		const seen = pressWatched(await openSelect(), 'Enter', fake.canvasContainer);

		expect(seen.reachedWindow).toBe(true);
		expect(seen.defaultPrevented).toBe(false);
		expect(seen.onMapSurface).toBe(false);
		expect(sessionState(result)).toEqual(before);
	});

	/**
	 * The overlay half. Radix's `DismissableLayer` listens on the document in the
	 * capture phase, spends the default, dismisses, and does not stop
	 * propagation, so the Escape that closed a select still reaches this listener
	 * on the listbox's own `div[role="option"]`.
	 */
	it('leaves the measurement alone when Escape dismissed an open select', async () => {
		const { fake, result } = mount();

		renderSelect();
		OPEN_DRAFTS[0]?.open(fake, result);
		const before = sessionState(result);

		const seen = pressWatched(await openSelect(), 'Escape', fake.canvasContainer);

		expect(seen.reachedWindow).toBe(true);
		expect(seen.onMapSurface).toBe(false);
		expect(sessionState(result)).toEqual(before);
	});

	// The other half of the same press, one key earlier: the trigger spends the
	// Enter that opens it.
	it('leaves the measurement alone when Enter opened a select', async () => {
		const { fake, result } = mount();

		renderSelect();
		OPEN_DRAFTS[0]?.open(fake, result);
		const before = sessionState(result);
		const trigger = selectTrigger();
		trigger.focus();

		act(() => {
			fireEvent.keyDown(trigger, { key: 'Enter' });
		});
		await screen.findByText('Pond');

		expect(sessionState(result)).toEqual(before);
	});

	// A menu opened with the pointer focuses its content, so the press lands on
	// `div[role="menu"]` and not on one of the `menuitem` roles. That is the
	// shape a rule about which presses are not the map's would have to enumerate.
	it('leaves the measurement alone when Enter came from an open menu', async () => {
		const { fake, result } = mount();

		renderMenu();
		OPEN_DRAFTS[0]?.open(fake, result);
		const before = sessionState(result);

		const seen = pressWatched(await openMenu(), 'Enter', fake.canvasContainer);

		expect(seen.reachedWindow).toBe(true);
		expect(seen.defaultPrevented).toBe(false);
		expect(seen.role).toBe('menu');
		expect(sessionState(result)).toEqual(before);
	});

	// The same press one element further in, which is why the rule reads the
	// canvas container and not the whole map: mapbox's attribution and info
	// buttons sit in a control container beside the canvas one, inside
	// `getContainer()`.
	it("leaves the measurement alone when Enter hit mapbox's own button", () => {
		const { fake, result } = mount();

		OPEN_DRAFTS[0]?.open(fake, result);
		const before = sessionState(result);

		fake.attributionButton.focus();
		const seen = pressWatched(fake.attributionButton, 'Enter', fake.canvasContainer);

		expect(seen.reachedWindow).toBe(true);
		expect(fake.container.contains(fake.attributionButton)).toBe(true);
		expect(seen.onMapSurface).toBe(false);
		expect(sessionState(result)).toEqual(before);
	});

	it.each(OPEN_DRAFTS)('finishes an open $name on an Enter the map canvas got', ({ open }) => {
		const { fake, result } = mount();

		open(fake, result);

		pressKeyIn(fake.canvas, 'Enter');

		expect(result.current.measurements).toHaveLength(1);
		expect(result.current.draft.get()).toBeNull();
	});

	it.each(OPEN_DRAFTS)('drops an open $name on an Escape the map canvas got', ({ open }) => {
		const { fake, result } = mount();

		open(fake, result);

		pressKeyIn(fake.canvas, 'Escape');

		expect(result.current.measurements).toEqual([]);
		expect(result.current.draft.get()).toBeNull();
	});

	/**
	 * No focus move, which is where this parts company with the draw session.
	 *
	 * A draft opens on the first map click and mapbox spends no default on
	 * `mousedown`, so the canvas already holds focus by the time there is a shape
	 * to finish or throw away. Before that click neither key can cost anything.
	 * Taking the canvas on `selectTool` would pull focus off the tool button the
	 * user just pressed, on every tool switch, and `MeasureControl` is a panel
	 * they keep working from.
	 */
	it('leaves focus on the panel when a tool is picked', () => {
		const { result } = mount();
		const toolButton = renderFocusedButton('Line');

		act(() => {
			result.current.selectTool('distance');
		});

		expect(document.activeElement).toBe(toolButton);
	});

	it('clears every shape and leaves measurement mode', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('rectangle');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-89, 36);
		});
		act(() => {
			result.current.clear();
		});

		expect(result.current.isMeasuring).toBe(false);
		expect(result.current.measurements).toEqual([]);
		expect(fake.featuresOf(SOURCE_ID)).toEqual([]);
	});

	// The step a careless extraction breaks: a basemap switch wipes every custom
	// source and layer, and the shapes measured so far have to come back too.
	it('puts the source, layers, and measured shapes back after a basemap switch', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('rectangle');
		});
		act(() => {
			fake.click(-90, 35);
		});
		act(() => {
			fake.click(-89, 36);
		});

		fake.wipeStyle();
		expect(fake.sources.size).toBe(0);

		act(() => {
			fake.emit('style.load');
		});

		expect([...fake.layers.keys()]).toEqual(LAYER_IDS);
		expect(roles(fake)).toEqual(['shape']);
	});

	// The shape being dragged out lives in a ref, not in state, so a restyle has
	// to repaint from the refs or the half-drawn rectangle disappears until the
	// next click.
	it('keeps the shape being dragged out across a basemap switch', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('rectangle');
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

		expect(roles(fake)).toEqual(['draft', 'vertex']);
		// The rectangle has to still reach the cursor. Re-seeding from the last
		// render would collapse it onto its anchor, where the cursor was when the
		// anchoring click rendered.
		expect(cornersOf(fake.featuresOf(SOURCE_ID)[0])).toContainEqual([-89, 36]);
	});

	it('removes its layers and source on unmount', () => {
		const { fake, unmount } = mount();

		unmount();

		expect(fake.layers.size).toBe(0);
		expect(fake.sources.size).toBe(0);
		expect(fake.listenerCount('style.load')).toBe(0);
	});

	it('survives a map that was already removed', () => {
		const { fake, unmount } = mount();

		fake.remove();

		expect(() => {
			unmount();
		}).not.toThrow();
	});

	it('leaves the map alone until a tool is picked', () => {
		const { fake } = mount();

		expect(fake.listenerCount('click')).toBe(0);
		expect(fake.canvas.style.cursor).toBe('');
		expect(fake.isDoubleClickZoomEnabled()).toBe(true);
	});

	it('restores the cursor and double-click zoom when measurement ends', () => {
		const { fake, result } = mount();

		act(() => {
			result.current.selectTool('distance');
		});
		expect(fake.canvas.style.cursor).toBe('crosshair');
		expect(fake.isDoubleClickZoomEnabled()).toBe(false);

		act(() => {
			result.current.clear();
		});

		expect(fake.canvas.style.cursor).toBe('');
		expect(fake.isDoubleClickZoomEnabled()).toBe(true);
		expect(fake.listenerCount('click')).toBe(0);
	});
});

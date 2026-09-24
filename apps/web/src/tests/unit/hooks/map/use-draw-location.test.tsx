// @vitest-environment jsdom
/**
 * The redraw flag, and the shape a tool change leaves behind.
 *
 * Twelve record forms used to hold this state themselves and the copies had
 * drifted. Two of the differences were bugs. The habitat form tracked no flag at
 * all, so its edit route recovered one by comparing `JSON.stringify` of the
 * drawn shape against `JSON.stringify` of the one the geometry endpoint
 * returned: two serialisations built by different code, differing on key order
 * and float formatting, and a difference names `updateHabitatLocation`, which a
 * collector may not send (#427). The registration form's tool selector left the
 * old shape in place, so a point could be saved under `Polygon`.
 *
 * So the two assertions that matter are: opening a form on a saved shape and
 * saving without touching the map reports no redraw, and changing the tool
 * clears the shape.
 */

import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DrawLocationOptions } from '../../../../hooks/map/use-draw-location';
import { useDrawLocation } from '../../../../hooks/map/use-draw-location';
import type { DrawGeometry } from '../../../../hooks/map/use-map-draw';
import type { MissionStopGeometry } from '../../../../hooks/operations/use-mission-stop-geometry';
import { cleanupRenderedHooks, createFakeMap, renderHook } from '../../components/map/fake-map';

const SAVED: DrawGeometry = { type: 'Point', coordinates: [-74.35, 40.55] };
/** A saved area, for the gestures a point has nothing to offer. */
const AREA: DrawGeometry = {
	type: 'Polygon',
	coordinates: [
		[
			[-74.35, 40.55],
			[-74.35, 40.56],
			[-74.34, 40.56],
			[-74.35, 40.55],
		],
	],
};

afterEach(cleanupRenderedHooks);

function mount(options: Partial<DrawLocationOptions> = {}) {
	const fake = createFakeMap();
	return renderHook(useDrawLocation, {
		geometryKind: 'trap',
		map: fake.map as never,
		missingMessage: 'Draw the shape on the map before saving.',
		...options,
	} satisfies DrawLocationOptions);
}

describe('useDrawLocation', () => {
	it('reports no redraw on a form reopened and saved without touching the map', () => {
		const { result } = mount({ initialGeometry: SAVED });

		expect(result.current.geometry).toEqual(SAVED);
		expect(result.current.geometryChanged).toBe(false);

		act(() => {
			expect(result.current.requireGeometry()).toBe(true);
		});

		expect(result.current.geometryChanged).toBe(false);
		expect(result.current.locationError).toBeNull();
	});

	it('reports a redraw once the shape is drawn', () => {
		const { result } = mount();

		act(() => {
			result.current.draw.commit({ type: 'Point', coordinates: [-74.4, 40.6] });
		});

		expect(result.current.geometryChanged).toBe(true);
		expect(result.current.geometry).toEqual({ type: 'Point', coordinates: [-74.4, 40.6] });
	});

	// #472: the exit that leaves the record alone used to be Cancel alone. Finish
	// on a continuation that placed no corner republished the same ring, the flag
	// went true, and the save named a command the collector floor refuses.
	it('reports no redraw when a continued piece is finished as it was', () => {
		const { result } = mount({ geometryKind: 'habitat', initialGeometry: AREA });

		act(() => {
			result.current.draw.continuePart(0);
		});
		act(() => {
			result.current.draw.finish();
		});

		expect(result.current.geometryChanged).toBe(false);
		expect(result.current.geometry).toEqual(AREA);
	});

	it('clears the stale shape when the tool changes', () => {
		const { result } = mount({ initialGeometry: SAVED });

		act(() => {
			result.current.changeType('Polygon');
		});

		expect(result.current.geometry).toBeNull();
		expect(result.current.geometryType).toBe('Polygon');
		expect(result.current.geometryChanged).toBe(true);
	});

	it('starts on the tool the form asked for when it opens with no shape', () => {
		const { result } = mount({ geometryType: 'Polygon' });

		expect(result.current.geometryType).toBe('Polygon');
	});

	// Opening on the first shape the register lists put every work record on
	// Point, so drawing the area the form is for started with a tool change.
	it('opens on the area tool where the record can store one', () => {
		expect(mount({ geometryKind: 'habitat' }).result.current.geometryType).toBe('Polygon');
		expect(mount({ geometryKind: 'trap' }).result.current.geometryType).toBe('Point');
	});

	it('reads a saved multi shape back as the tool that draws it', () => {
		const { result } = mount({
			geometryKind: 'habitat',
			initialGeometry: {
				type: 'MultiPolygon',
				coordinates: [
					[
						[
							[-74.4, 40.5],
							[-74.4, 40.6],
							[-74.3, 40.6],
							[-74.4, 40.5],
						],
					],
				],
			},
		});

		expect(result.current.geometryType).toBe('Polygon');
	});

	it('follows the saved shape over the form default when it opens with one', () => {
		const { result } = mount({ geometryType: 'Polygon', initialGeometry: SAVED });

		expect(result.current.geometryType).toBe('Point');
	});

	it('reports the missing shape on submit, and clears it once one is drawn', () => {
		const { result } = mount();

		act(() => {
			expect(result.current.requireGeometry()).toBe(false);
		});
		expect(result.current.locationError).toBe('Draw the shape on the map before saving.');

		act(() => {
			result.current.draw.commit(SAVED);
		});
		expect(result.current.locationError).toBeNull();
	});

	it('lets an optional location through with nothing drawn', () => {
		const { result } = mount({ required: false });

		act(() => {
			expect(result.current.requireGeometry()).toBe(true);
		});
		expect(result.current.locationError).toBeNull();
	});

	it('seeds an empty location from a picked record, and keeps a drawn one', () => {
		const { result } = mount();

		act(() => {
			result.current.selectReference({ lat: 40.7, lng: -74.2 });
		});
		expect(result.current.geometry).toEqual({ type: 'Point', coordinates: [-74.2, 40.7] });
		expect(result.current.referenceGeometry).toBeNull();

		act(() => {
			result.current.selectReference({ lat: 41, lng: -75 });
		});
		expect(result.current.geometry).toEqual({ type: 'Point', coordinates: [-74.2, 40.7] });
		expect(result.current.referenceGeometry).toEqual({ type: 'Point', coordinates: [-75, 41] });
	});

	describe('on a mission stop', () => {
		const STOP: DrawGeometry = AREA;
		const loading = { status: 'loading' } as const;
		const ready = { status: 'ready', geometry: STOP } as const;

		function mountOnStop(missionStop: MissionStopGeometry | null) {
			const fake = createFakeMap();
			const base = {
				geometryKind: 'controlAction',
				map: fake.map as never,
				missingMessage: 'Draw the shape on the map before saving.',
			} satisfies DrawLocationOptions;
			const hook = renderHook(useDrawLocation, { ...base, missionStop });
			return {
				...hook,
				arrive: (next: MissionStopGeometry | null) => hook.rerender({ ...base, missionStop: next }),
			};
		}

		// #1233: the stop's shape arrives over the network after the form opened,
		// so `initialGeometry` cannot carry it.
		it('draws the stop geometry once it arrives', () => {
			const { result, arrive } = mountOnStop(loading);
			expect(result.current.geometry).toBeNull();

			arrive(ready);

			expect(result.current.geometry).toEqual(STOP);
			expect(result.current.geometryType).toBe('Polygon');
		});

		it('keeps a shape drawn before the stop geometry arrived', () => {
			const { result, arrive } = mountOnStop(loading);
			act(() => {
				result.current.draw.commit(SAVED);
			});

			arrive(ready);

			expect(result.current.geometry).toEqual(SAVED);
		});

		it('leaves a cleared geometry cleared, so the save is refused', () => {
			const { result } = mountOnStop(ready);
			expect(result.current.geometry).toEqual(STOP);

			act(() => {
				result.current.clear();
			});
			act(() => {
				expect(result.current.requireGeometry()).toBe(false);
			});

			expect(result.current.geometry).toBeNull();
			expect(result.current.locationError).toBe('Draw the shape on the map before saving.');
		});

		it('restores the stop geometry after an edit, and clears the refusal', () => {
			const { result } = mountOnStop(ready);
			act(() => {
				result.current.changeType('Point');
			});
			act(() => {
				result.current.requireGeometry();
			});

			act(() => {
				result.current.restoreStopGeometry();
			});

			expect(result.current.geometry).toEqual(STOP);
			expect(result.current.geometryType).toBe('Polygon');
			expect(result.current.locationError).toBeNull();
		});

		// A stop can hold any of the six shapes, and the tool follows the base type.
		it.each([
			[{ type: 'Point', coordinates: [-74.4, 40.6] }, 'Point'],
			[
				{
					type: 'MultiPoint',
					coordinates: [
						[-74.4, 40.6],
						[-74.3, 40.5],
					],
				},
				'Point',
			],
			[
				{
					type: 'LineString',
					coordinates: [
						[-74.4, 40.6],
						[-74.3, 40.5],
					],
				},
				'LineString',
			],
			[
				{
					type: 'MultiLineString',
					coordinates: [
						[
							[-74.4, 40.6],
							[-74.3, 40.5],
						],
					],
				},
				'LineString',
			],
			[AREA, 'Polygon'],
			[{ type: 'MultiPolygon', coordinates: [AREA.coordinates] }, 'Polygon'],
		] as const)('draws a %j stop on the %s tool', (stop, tool) => {
			const { result } = mountOnStop({ status: 'ready', geometry: stop as DrawGeometry });

			expect(result.current.geometry).toEqual(stop);
			expect(result.current.geometryType).toBe(tool);
		});

		it('refuses a save while the stop geometry loads, and says why', () => {
			const { result } = mountOnStop(loading);

			act(() => {
				expect(result.current.requireGeometry()).toBe(false);
			});

			expect(result.current.locationError).toBe("The mission stop's geometry is still loading.");
		});

		it('carries no stop off a mission', () => {
			const { result } = mount({ geometryKind: 'controlAction' });

			expect(result.current.missionStop).toBeNull();
			act(() => {
				result.current.restoreStopGeometry();
			});
			expect(result.current.geometry).toBeNull();
		});
	});
});

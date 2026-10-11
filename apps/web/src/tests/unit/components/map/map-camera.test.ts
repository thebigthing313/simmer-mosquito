// @vitest-environment jsdom
import { MAP_CLUSTER_UNTIL_ZOOM } from '@simmer-mosquito/mapping';
import { afterEach, describe, expect, it } from 'vitest';
import {
	FOCUS_PURPOSES,
	FRAME_PURPOSES,
	type FramePurpose,
	focusOnMap,
	frameOnMap,
} from '../../../../components/map/map-camera';
import { requestCanvasInset } from '../../../../components/map/map-inset';
import { cleanupRenderedHooks, createFakeMap } from './fake-map';

afterEach(() => {
	cleanupRenderedHooks();
});

const BOX = { west: -74.5, south: 40.3, east: -74.4, north: 40.4 };
const POINT_BOX = { west: -74.4, south: 40.3, east: -74.4, north: 40.3 };
const PANEL = { top: 0, right: 0, bottom: 0, left: 416 };

/** A fake map already carrying the canvas padding a results panel gives it. */
function mapUnderPanel() {
	const fake = createFakeMap();
	fake.map.easeTo({ padding: PANEL, duration: 0 });
	return fake;
}

function around(margin: number, inset = PANEL) {
	return {
		top: inset.top + margin,
		right: inset.right + margin,
		bottom: inset.bottom + margin,
		left: inset.left + margin,
	};
}

describe('frameOnMap', () => {
	const purposes: readonly {
		readonly purpose: FramePurpose;
		readonly margin: number;
		readonly maxZoom: number;
		readonly duration: number | undefined;
		readonly pointZoom: number;
	}[] = [
		{ purpose: 'record', margin: 64, maxZoom: 17, duration: 600, pointZoom: 16 },
		{ purpose: 'context', margin: 56, maxZoom: 17, duration: 400, pointZoom: 16 },
		{
			purpose: 'collection',
			margin: 56,
			maxZoom: 16,
			duration: 600,
			pointZoom: MAP_CLUSTER_UNTIL_ZOOM,
		},
		{
			purpose: 'cluster',
			margin: 48,
			maxZoom: MAP_CLUSTER_UNTIL_ZOOM,
			duration: undefined,
			pointZoom: MAP_CLUSTER_UNTIL_ZOOM,
		},
	];

	it('has a row for every purpose it is asked about here', () => {
		expect(Object.keys(FRAME_PURPOSES).sort()).toEqual(purposes.map((row) => row.purpose).sort());
	});

	for (const { purpose, margin, maxZoom, duration, pointZoom } of purposes) {
		it(`fits a ${purpose} box with area at margin ${margin}, cap ${maxZoom}`, () => {
			const fake = mapUnderPanel();

			frameOnMap(fake.map, BOX, { purpose, animate: true });

			expect(fake.cameraCalls.at(-1)).toEqual(
				expect.objectContaining({
					kind: 'fitBounds',
					bounds: [
						[BOX.west, BOX.south],
						[BOX.east, BOX.north],
					],
					padding: around(margin),
					retainPadding: false,
					maxZoom,
					duration,
				}),
			);
			expect(fake.map.getPadding()).toEqual(PANEL);
		});

		it(`eases a ${purpose} box with no area to its centre at zoom ${pointZoom}`, () => {
			const fake = mapUnderPanel();

			frameOnMap(fake.map, POINT_BOX, { purpose, animate: true });

			expect(fake.cameraCalls.at(-1)).toEqual(
				expect.objectContaining({
					kind: 'easeTo',
					center: [POINT_BOX.west, POINT_BOX.south],
					zoom: pointZoom,
					padding: around(margin),
					retainPadding: false,
					duration,
				}),
			);
		});

		it(`lands a ${purpose} frame at once when it is not animated`, () => {
			const fake = mapUnderPanel();

			frameOnMap(fake.map, BOX, { purpose, animate: false });

			expect(fake.cameraCalls.at(-1)?.duration).toBe(0);
		});
	}

	it('keeps a closer view on a point than the floor, apart from a cluster', () => {
		const fake = createFakeMap();
		fake.setZoom(18);

		frameOnMap(fake.map, POINT_BOX, { purpose: 'record', animate: true });
		frameOnMap(fake.map, POINT_BOX, { purpose: 'cluster', animate: true });

		expect(fake.cameraCalls.map((call) => call.zoom)).toEqual([18, MAP_CLUSTER_UNTIL_ZOOM]);
	});

	it('frames a geometry by its bounds', () => {
		const fake = createFakeMap();

		frameOnMap(
			fake.map,
			{
				type: 'LineString',
				coordinates: [
					[-74.5, 40.3],
					[-74.4, 40.4],
				],
			},
			{ purpose: 'record', animate: true },
		);
		frameOnMap(
			fake.map,
			{ type: 'Point', coordinates: [-74.4, 40.3] },
			{ purpose: 'record', animate: true },
		);

		expect(fake.cameraCalls.map(({ kind, bounds, center }) => ({ kind, bounds, center }))).toEqual([
			{
				kind: 'fitBounds',
				bounds: [
					[-74.5, 40.3],
					[-74.4, 40.4],
				],
				center: undefined,
			},
			{ kind: 'easeTo', bounds: undefined, center: [-74.4, 40.3] },
		]);
	});

	it('reads an inset it is handed over the padding the canvas holds', () => {
		const fake = mapUnderPanel();
		const sheet = { top: 0, right: 0, bottom: 222, left: 0 };

		frameOnMap(fake.map, BOX, { purpose: 'collection', animate: true, inset: sheet });
		frameOnMap(fake.map, POINT_BOX, { purpose: 'collection', animate: true, inset: sheet });

		expect(fake.cameraCalls.slice(-2)).toEqual([
			expect.objectContaining({ padding: around(56, sheet), retainPadding: false }),
			expect.objectContaining({ padding: around(56, sheet), retainPadding: false }),
		]);
		expect(fake.map.getPadding()).toEqual(PANEL);
	});

	// A fit that starts while the canvas's padding ease is running reads an
	// in-between value off getPadding, so the margin is built on the inset the
	// canvas asked for instead (#1490).
	it('builds on the inset the canvas asked for, not a padding left partway', () => {
		const fake = mapUnderPanel();
		requestCanvasInset(fake.map, PANEL);
		fake.strandPadding({ top: 0, right: 0, bottom: 0, left: 230 });
		const sheet = { top: 0, right: 0, bottom: 222, left: 0 };

		frameOnMap(fake.map, BOX, { purpose: 'collection', animate: true });
		frameOnMap(fake.map, BOX, { purpose: 'collection', animate: true, inset: sheet });

		expect(fake.cameraCalls.slice(-2)).toEqual([
			expect.objectContaining({ padding: around(56), retainPadding: false }),
			expect.objectContaining({ padding: around(56, sheet), retainPadding: false }),
		]);
	});

	it('moves nothing for a target with no finite bounds', () => {
		const fake = createFakeMap();

		frameOnMap(fake.map, null, { purpose: 'record', animate: true });
		frameOnMap(
			fake.map,
			{ type: 'MultiPoint', coordinates: [] },
			{ purpose: 'record', animate: true },
		);
		frameOnMap(
			fake.map,
			{ west: Number.POSITIVE_INFINITY, south: 0, east: Number.NEGATIVE_INFINITY, north: 1 },
			{ purpose: 'collection', animate: true },
		);
		frameOnMap(
			fake.map,
			{ west: Number.NaN, south: 0, east: 1, north: 1 },
			{ purpose: 'collection', animate: true },
		);

		expect(fake.cameraCalls).toEqual([]);
	});
});

describe('focusOnMap', () => {
	it('flies to a point at the purpose floor, keeping a closer view', () => {
		const fake = mapUnderPanel();

		focusOnMap(fake.map, { lng: -74.4, lat: 40.3 }, { purpose: 'selection' });
		fake.setZoom(16);
		focusOnMap(fake.map, { lng: -74.4, lat: 40.3 }, { purpose: 'place' });

		expect(fake.cameraCalls.slice(-2)).toEqual([
			expect.objectContaining({
				kind: 'flyTo',
				center: [-74.4, 40.3],
				zoom: FOCUS_PURPOSES.selection.zoomFloor,
				duration: FOCUS_PURPOSES.selection.duration,
				padding: undefined,
			}),
			expect.objectContaining({
				kind: 'flyTo',
				zoom: 16,
				duration: FOCUS_PURPOSES.place.duration,
				padding: undefined,
			}),
		]);
		expect(FOCUS_PURPOSES).toEqual({
			selection: { zoomFloor: 14, duration: 700 },
			place: { zoomFloor: 15, duration: 1100 },
		});
		expect(fake.map.getPadding()).toEqual(PANEL);
	});

	it('hands its event data to the flight', () => {
		const fake = createFakeMap();
		const eventData = { holdsRail: true };

		focusOnMap(fake.map, { lng: -74.4, lat: 40.3 }, { purpose: 'selection', eventData });
		focusOnMap(fake.map, { lng: -74.4, lat: 40.3 }, { purpose: 'selection' });

		expect(fake.cameraCalls.map((call) => call.eventData)).toEqual([eventData, undefined]);
	});
});

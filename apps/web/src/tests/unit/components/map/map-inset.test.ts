// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { framingPadding } from '../../../../components/map/map-inset';
import { cleanupRenderedHooks, createFakeMap } from './fake-map';

afterEach(() => {
	cleanupRenderedHooks();
});

describe('framingPadding', () => {
	it('adds the margin to the padding the canvas holds, and asks mapbox not to keep it', () => {
		const fake = createFakeMap();
		fake.map.easeTo({ padding: { top: 0, right: 0, bottom: 0, left: 416 }, duration: 0 });

		expect(framingPadding(fake.map, 48)).toEqual({
			padding: { top: 48, right: 48, bottom: 48, left: 464 },
			retainPadding: false,
		});
	});

	it('reads an inset it is handed over the padding the canvas holds', () => {
		const fake = createFakeMap();
		fake.map.easeTo({ padding: { top: 0, right: 0, bottom: 0, left: 416 }, duration: 0 });

		expect(framingPadding(fake.map, 56, { top: 0, right: 0, bottom: 222, left: 0 })).toEqual({
			padding: { top: 56, right: 56, bottom: 278, left: 56 },
			retainPadding: false,
		});
	});

	it('leaves the canvas padding on the map after a fit that carries it', () => {
		const fake = createFakeMap();
		fake.map.easeTo({ padding: { top: 0, right: 0, bottom: 0, left: 416 }, duration: 0 });

		fake.map.fitBounds(
			[
				[0, 0],
				[1, 1],
			],
			framingPadding(fake.map, 64),
		);

		expect(fake.map.getPadding()).toEqual({ top: 0, right: 0, bottom: 0, left: 416 });
	});
});

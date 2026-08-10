import { describe, expect, it } from 'vitest';
import {
	buildTileQueryString,
	buildTileUrlTemplate,
	formatTileCoordinate,
	isTileCoordinate,
	normalizeTileQueryFilters,
} from '../../tiles.js';

describe('tile helpers', () => {
	it('validates slippy tile coordinates', () => {
		expect(isTileCoordinate({ z: 0, x: 0, y: 0 })).toBe(true);
		expect(isTileCoordinate({ z: 2, x: 3, y: 3 })).toBe(true);
		expect(isTileCoordinate({ z: 2, x: 4, y: 0 })).toBe(false);
		expect(formatTileCoordinate({ z: 2, x: 3, y: 1 })).toBe('2/3/1');
	});

	it('canonicalizes tile filters for stable cache keys', () => {
		expect(
			normalizeTileQueryFilters({
				habitatTypeId: ['b', 'a'],
				isActive: true,
				empty: '',
				'not-safe': 'nope',
			}),
		).toEqual({
			habitatTypeId: 'a,b',
			isActive: 'true',
		});
		expect(
			buildTileQueryString({
				isActive: false,
				habitatTypeId: ['b', 'a'],
			}),
		).toBe('habitatTypeId=a%2Cb&isActive=false');
	});

	it('builds authenticated server tile URL templates', () => {
		expect(
			buildTileUrlTemplate({
				tileset: 'habitats',
				filters: { isActive: true },
			}),
		).toBe('/map/tiles/habitats/{z}/{x}/{y}.mvt?isActive=true');
	});
});

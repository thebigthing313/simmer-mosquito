import { describe, expect, it } from 'vitest';
import { createGeoJsonMapSource, createHabitatTileSource, emptyMapStyle } from './styles';

describe('map styles', () => {
	it('does not emit OKLCH colors in Mapbox style definitions', () => {
		const habitatSource = createHabitatTileSource({ serverUrl: 'https://example.test' });
		const geoJsonSource = createGeoJsonMapSource({
			id: 'test-source',
			data: {
				type: 'FeatureCollection',
				features: [],
			},
		});

		expect(collectOklchValues(emptyMapStyle)).toEqual([]);
		expect(collectOklchValues(habitatSource.layers)).toEqual([]);
		expect(collectOklchValues(geoJsonSource.layers)).toEqual([]);
	});
});

function collectOklchValues(value: unknown): string[] {
	if (typeof value === 'string') {
		return value.includes('oklch(') ? [value] : [];
	}

	if (Array.isArray(value)) {
		return value.flatMap(collectOklchValues);
	}

	if (value !== null && typeof value === 'object') {
		return Object.values(value).flatMap(collectOklchValues);
	}

	return [];
}

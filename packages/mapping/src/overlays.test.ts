import { describe, expect, it } from 'vitest';
import type { MapOverlayDefinition } from './overlays.js';
import {
	getVisibleOverlayIds,
	normalizeOverlayVisibility,
	overlayVisibilityFromDefinitions,
} from './overlays.js';

const overlays = [
	{
		id: 'habitats',
		label: 'Habitats',
		defaultVisible: false,
		source: {
			kind: 'mvt',
			tileSource: {
				id: 'habitats',
				tileset: 'habitats',
				layers: ['habitats'],
				urlTemplate: '/map/tiles/habitats/{z}/{x}/{y}.mvt',
			},
		},
	},
	{
		id: 'regions',
		label: 'Regions',
		defaultVisible: true,
		source: {
			kind: 'mvt',
			tileSource: {
				id: 'regions',
				tileset: 'boundaries',
				layers: ['regions'],
				urlTemplate: '/map/tiles/boundaries/{z}/{x}/{y}.mvt',
			},
		},
	},
] as const satisfies readonly MapOverlayDefinition[];

describe('overlay helpers', () => {
	it('initializes visibility from definitions', () => {
		expect(overlayVisibilityFromDefinitions(overlays)).toEqual({
			habitats: false,
			regions: true,
		});
	});

	it('normalizes persisted visibility against the current definitions', () => {
		expect(
			normalizeOverlayVisibility(overlays, {
				habitats: true,
				staleOverlay: true,
			}),
		).toEqual({
			habitats: true,
			regions: true,
		});
	});

	it('lists visible overlays in definition order', () => {
		expect(getVisibleOverlayIds(overlays, { habitats: true, regions: false })).toEqual([
			'habitats',
		]);
	});
});

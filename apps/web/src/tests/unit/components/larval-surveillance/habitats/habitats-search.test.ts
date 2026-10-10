import { describe, expect, it } from 'vitest';
import {
	HABITAT_FILTER_DEFAULTS,
	habitatTileFilters,
} from '../../../../../components/larval-surveillance/habitats/habitats-search';

/**
 * The Map and the Table send one filter set to `/map/habitats`, built from
 * these tile filters. The wire names are the shared spec's, and the round trip
 * in `apps/server` holds them.
 */
describe('the habitats tile filters', () => {
	it('ask for active habitats and nothing else when no filter is set', () => {
		expect(habitatTileFilters(HABITAT_FILTER_DEFAULTS)).toEqual({ isActive: true });
	});

	it('carry every filter the Map has', () => {
		expect(
			habitatTileFilters({
				search: 'ditch',
				status: 'inactive',
				access: 'inaccessible',
				typeIds: new Set(['type-1']),
				tagIds: new Set(['tag-1', 'tag-2']),
				regions: new Set(['region-1']),
				untreated: true,
			}),
		).toEqual({
			isActive: false,
			isInaccessible: true,
			habitatTypeIds: ['type-1'],
			tagIds: ['tag-1', 'tag-2'],
			regionIds: ['region-1'],
			search: 'ditch',
			untreatedOnly: true,
		});
	});

	it('leave Status and Access off when they are All', () => {
		expect(
			habitatTileFilters({ ...HABITAT_FILTER_DEFAULTS, status: 'all', access: 'all' }),
		).toEqual({});
	});
});

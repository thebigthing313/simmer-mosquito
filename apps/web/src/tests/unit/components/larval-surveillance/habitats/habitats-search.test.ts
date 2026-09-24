import { describe, expect, it } from 'vitest';
import {
	HABITAT_FILTER_DEFAULTS,
	habitatListParams,
	habitatTileFilters,
} from '../../../../../components/larval-surveillance/habitats/habitats-search';
import { mapQueryParams } from '../../../../../hooks/explorer/use-paged-map-resource';

/**
 * The Map and the Table send one filter set to `/map/habitats`, so this is the
 * one place the translation from the address bar to the request is written.
 */
describe('the habitats list request', () => {
	it('asks for active habitats and nothing else when no filter is set', () => {
		const params = mapQueryParams(habitatListParams(habitatTileFilters(HABITAT_FILTER_DEFAULTS)));

		expect(params).toEqual({ isActive: 'true' });
	});

	it('sends every filter the Map has, under the names the endpoint reads', () => {
		const params = mapQueryParams(
			habitatListParams(
				habitatTileFilters({
					search: 'ditch',
					status: 'inactive',
					access: 'inaccessible',
					typeIds: new Set(['type-1']),
					tagIds: new Set(['tag-1', 'tag-2']),
					regions: new Set(['region-1']),
					untreated: true,
				}),
			),
		);

		expect(params).toEqual({
			isActive: 'false',
			isInaccessible: 'true',
			habitatTypeId: 'type-1',
			tagId: 'tag-1,tag-2',
			regionId: 'region-1',
			search: 'ditch',
			untreated: 'true',
		});
	});

	it('leaves Status and Access off when they are All', () => {
		const params = mapQueryParams(
			habitatListParams(
				habitatTileFilters({ ...HABITAT_FILTER_DEFAULTS, status: 'all', access: 'all' }),
			),
		);

		expect(params).toEqual({});
	});
});

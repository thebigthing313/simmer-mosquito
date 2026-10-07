import { describe, expect, it } from 'vitest';
import {
	ADDRESS_FILTER_DEFAULTS,
	addressListParams,
	addressTileFilters,
} from '../../../../../components/gis/addresses/addresses-search';
import { mapQueryParams } from '../../../../../hooks/explorer/use-paged-map-resource';

/**
 * The Map and the Table send one filter set to `/map/addresses`, so this is
 * the one place the translation from the address bar to the request is
 * written.
 */
describe('the addresses list request', () => {
	it('sends no filter when none is set', () => {
		const params = mapQueryParams(addressListParams(addressTileFilters(ADDRESS_FILTER_DEFAULTS)));

		expect(params).toEqual({});
	});

	it('sends both filters the Map has, under the names the endpoint reads', () => {
		const params = mapQueryParams(
			addressListParams(
				addressTileFilters({ search: 'Elm', regions: new Set(['region-1', 'region-2']) }),
			),
		);

		expect(params).toEqual({ search: 'Elm', regionId: 'region-1,region-2' });
	});

	it('leaves a search of spaces off', () => {
		const params = mapQueryParams(
			addressListParams(addressTileFilters({ ...ADDRESS_FILTER_DEFAULTS, search: '   ' })),
		);

		expect(params).toEqual({});
	});
});

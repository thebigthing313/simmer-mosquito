import { describe, expect, it } from 'vitest';
import { recordSetFilterParams } from '../../../../../components/explorer/record-set';
import {
	ADDRESS_FILTER_DEFAULTS,
	addressRecordSet,
	addressTileFilters,
} from '../../../../../components/gis/addresses/addresses-search';

/**
 * The Map and the Table send one filter set to `/map/addresses`, built from
 * these tile filters. The wire names are the shared spec's, and the round trip
 * in `apps/server` holds them.
 */
describe('the addresses tile filters', () => {
	it('carry no filter when none is set', () => {
		expect(addressTileFilters(ADDRESS_FILTER_DEFAULTS)).toEqual({});
	});

	it('carry both filters the Map has', () => {
		expect(
			addressTileFilters({ search: 'Elm', regions: new Set(['region-1', 'region-2']) }),
		).toEqual({ search: 'Elm', regionIds: ['region-1', 'region-2'] });
	});

	it('send no search for a search of spaces', () => {
		const tile = addressTileFilters({ ...ADDRESS_FILTER_DEFAULTS, search: '   ' });

		expect(recordSetFilterParams(addressRecordSet, tile)).toEqual({});
	});
});

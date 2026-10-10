import { describe, expect, it } from 'vitest';
import {
	collectionFilterDefaults,
	collectionListParams,
	collectionTileFilters,
} from '../../../../../components/adult-surveillance/collections/collections-search';
import { mapQueryParams } from '../../../../../lib/map-query-params';

/**
 * The Map and the Table send one filter set to `/map/collections`, so this is
 * the one place the translation from the address bar to the request is written.
 */
describe('the collections list request', () => {
	it('opens on the last 90 days, ending on the day it is given', () => {
		const params = mapQueryParams(
			collectionListParams(collectionTileFilters(collectionFilterDefaults('2026-09-28'))),
		);

		expect(params).toEqual({ dateFrom: '2026-07-01', dateTo: '2026-09-28' });
	});

	it('sends every filter the Map has, under the names the endpoint reads', () => {
		const params = mapQueryParams(
			collectionListParams(
				collectionTileFilters({
					from: '2026-09-01',
					to: '2026-09-28',
					methods: new Set(['method-1', 'method-2']),
					problems: true,
					awaiting: true,
					regions: new Set(['region-1']),
				}),
			),
		);

		expect(params).toEqual({
			collectionMethodId: 'method-1,method-2',
			problem: 'true',
			awaiting: 'true',
			regionId: 'region-1',
			dateFrom: '2026-09-01',
			dateTo: '2026-09-28',
		});
	});
});

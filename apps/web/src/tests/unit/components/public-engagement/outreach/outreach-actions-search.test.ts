import { describe, expect, it } from 'vitest';
import {
	outreachFilterDefaults,
	outreachListParams,
	outreachTileFilters,
} from '../../../../../components/public-engagement/outreach/outreach-actions-search';
import { mapQueryParams } from '../../../../../lib/map-query-params';

/**
 * The Map and the Table send one filter set to `/map/outreach`, so this is
 * the one place the translation from the address bar to the request is
 * written.
 */
describe('the outreach actions list request', () => {
	it('opens on the last 90 days, ending on the day it is given', () => {
		const params = mapQueryParams(
			outreachListParams(outreachTileFilters(outreachFilterDefaults('2026-09-28'))),
		);

		expect(params).toEqual({ dateFrom: '2026-07-01', dateTo: '2026-09-28' });
	});

	it('sends every filter the Map has, under the names the endpoint reads', () => {
		const params = mapQueryParams(
			outreachListParams(
				outreachTileFilters({
					from: '2026-09-01',
					to: '2026-09-28',
					methods: new Set(['method-1', 'method-2']),
					people: new Set(['person-1']),
					regions: new Set(['region-1']),
				}),
			),
		);

		expect(params).toEqual({
			outreachMethodId: 'method-1,method-2',
			technician: 'person-1',
			regionId: 'region-1',
			dateFrom: '2026-09-01',
			dateTo: '2026-09-28',
		});
	});
});

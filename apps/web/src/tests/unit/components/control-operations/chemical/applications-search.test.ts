import { describe, expect, it } from 'vitest';
import {
	applicationFilterDefaults,
	applicationListParams,
	applicationTileFilters,
} from '../../../../../components/control-operations/chemical/applications-search';
import { mapQueryParams } from '../../../../../lib/map-query-params';

/**
 * The Map and the Table send one filter set to `/map/chemical`, so this is the
 * one place the translation from the address bar to the request is written.
 */
describe('the chemical applications list request', () => {
	it('opens on the last 90 days, ending on the day it is given', () => {
		const params = mapQueryParams(
			applicationListParams(applicationTileFilters(applicationFilterDefaults('2026-09-28'))),
		);

		expect(params).toEqual({ dateFrom: '2026-07-01', dateTo: '2026-09-28' });
	});

	it('sends every filter the Map has, under the names the endpoint reads', () => {
		const params = mapQueryParams(
			applicationListParams(
				applicationTileFilters({
					from: '2026-09-01',
					to: '2026-09-28',
					insecticides: new Set(['insecticide-1', 'insecticide-2']),
					methods: new Set(['method-1']),
					people: new Set(['person-1']),
					regions: new Set(['region-1']),
				}),
			),
		);

		expect(params).toEqual({
			insecticideId: 'insecticide-1,insecticide-2',
			applicationMethodId: 'method-1',
			applicator: 'person-1',
			regionId: 'region-1',
			dateFrom: '2026-09-01',
			dateTo: '2026-09-28',
		});
	});
});

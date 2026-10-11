import { describe, expect, it } from 'vitest';
import {
	applicationFilterDefaults,
	applicationTileFilters,
} from '../../../../../components/control-operations/chemical/applications-search';

/**
 * The Map and the Table send one filter set to `/map/chemical`, built from
 * these tile filters. The wire names are the shared spec's, and the round trip
 * in `apps/server` holds them.
 */
describe('the chemical applications tile filters', () => {
	it('open on the last 90 days, ending on the day they are given', () => {
		expect(applicationTileFilters(applicationFilterDefaults('2026-09-28'))).toEqual({
			dateFrom: '2026-07-01',
			dateTo: '2026-09-28',
		});
	});

	it('carry every filter the Map has', () => {
		expect(
			applicationTileFilters({
				from: '2026-09-01',
				to: '2026-09-28',
				insecticides: new Set(['insecticide-1', 'insecticide-2']),
				methods: new Set(['method-1']),
				people: new Set(['person-1']),
				regions: new Set(['region-1']),
			}),
		).toEqual({
			insecticideIds: ['insecticide-1', 'insecticide-2'],
			applicationMethodIds: ['method-1'],
			applicatorProfileIds: ['person-1'],
			regionIds: ['region-1'],
			dateFrom: '2026-09-01',
			dateTo: '2026-09-28',
		});
	});
});

import { describe, expect, it } from 'vitest';
import {
	outreachFilterDefaults,
	outreachTileFilters,
} from '../../../../../components/public-engagement/outreach/outreach-actions-search';

/**
 * The Map and the Table send one filter set to `/map/outreach`, built from
 * these tile filters. The wire names are the shared spec's, and the round trip
 * in `apps/server` holds them.
 */
describe('the outreach actions tile filters', () => {
	it('open on the last 90 days, ending on the day they are given', () => {
		expect(outreachTileFilters(outreachFilterDefaults('2026-09-28'))).toEqual({
			dateFrom: '2026-07-01',
			dateTo: '2026-09-28',
		});
	});

	it('carry every filter the Map has', () => {
		expect(
			outreachTileFilters({
				from: '2026-09-01',
				to: '2026-09-28',
				methods: new Set(['method-1', 'method-2']),
				people: new Set(['person-1']),
				regions: new Set(['region-1']),
			}),
		).toEqual({
			outreachMethodIds: ['method-1', 'method-2'],
			technicianProfileIds: ['person-1'],
			regionIds: ['region-1'],
			dateFrom: '2026-09-01',
			dateTo: '2026-09-28',
		});
	});
});

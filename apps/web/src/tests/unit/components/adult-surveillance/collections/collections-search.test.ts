import { describe, expect, it } from 'vitest';
import {
	collectionFilterDefaults,
	collectionTileFilters,
} from '../../../../../components/adult-surveillance/collections/collections-search';

/**
 * The Map and the Table send one filter set to `/map/collections`, built from
 * these tile filters. The wire names are the shared spec's, and the round trip
 * in `apps/server` holds them.
 */
describe('the collections tile filters', () => {
	it('open on the last 90 days, ending on the day they are given', () => {
		expect(collectionTileFilters(collectionFilterDefaults('2026-09-28'))).toEqual({
			dateFrom: '2026-07-01',
			dateTo: '2026-09-28',
		});
	});

	it('carry every filter the Map has', () => {
		expect(
			collectionTileFilters({
				from: '2026-09-01',
				to: '2026-09-28',
				methods: new Set(['method-1', 'method-2']),
				problems: true,
				awaiting: true,
				regions: new Set(['region-1']),
			}),
		).toEqual({
			collectionMethodIds: ['method-1', 'method-2'],
			problemOnly: true,
			awaitingOnly: true,
			regionIds: ['region-1'],
			dateFrom: '2026-09-01',
			dateTo: '2026-09-28',
		});
	});
});

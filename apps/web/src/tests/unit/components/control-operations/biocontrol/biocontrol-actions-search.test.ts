import { describe, expect, it } from 'vitest';
import {
	biocontrolFilterDefaults,
	biocontrolTileFilters,
} from '../../../../../components/control-operations/biocontrol/biocontrol-actions-search';

/**
 * The Map and the Table send one filter set to `/map/biocontrol`, built from
 * these tile filters. The wire names are the shared spec's, and the round trip
 * in `apps/server` holds them.
 */
describe('the biocontrol actions tile filters', () => {
	it('open on the last 90 days, ending on the day they are given', () => {
		expect(biocontrolTileFilters(biocontrolFilterDefaults('2026-09-28'))).toEqual({
			dateFrom: '2026-07-01',
			dateTo: '2026-09-28',
		});
	});

	it('carry every filter the Map has', () => {
		expect(
			biocontrolTileFilters({
				from: '2026-09-01',
				to: '2026-09-28',
				methods: new Set(['method-1', 'method-2']),
				people: new Set(['person-1']),
				habitat: true,
				regions: new Set(['region-1']),
			}),
		).toEqual({
			biocontrolMethodIds: ['method-1', 'method-2'],
			technicianProfileIds: ['person-1'],
			habitatLinkedOnly: true,
			regionIds: ['region-1'],
			dateFrom: '2026-09-01',
			dateTo: '2026-09-28',
		});
	});
});

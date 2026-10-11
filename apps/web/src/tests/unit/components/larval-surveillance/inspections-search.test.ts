import { describe, expect, it } from 'vitest';
import {
	type InspectionFilters,
	inspectionTileFilters,
} from '../../../../components/larval-surveillance/inspections-search';

const OPEN: InspectionFilters = {
	from: '',
	to: '',
	water: 'all',
	density: new Set(),
	positive: false,
	types: new Set(),
	inspectors: new Set(),
	regions: new Set(),
};

function tileFor(filters: Partial<InspectionFilters>) {
	return inspectionTileFilters({ ...OPEN, ...filters });
}

/**
 * The Map and the Table send one filter set to `/map/inspections`, built from
 * these tile filters. The wire names are the shared spec's, and the round trip
 * in `apps/server` holds them.
 */
describe('inspection tile filters', () => {
	it('carry nothing for a filter set left open', () => {
		expect(tileFor({})).toEqual({});
	});

	it('carry every filter the Map has', () => {
		expect(
			tileFor({
				from: '2026-04-01',
				to: '2026-04-30',
				density: new Set(['heavy', 'very_heavy'] as const),
				inspectors: new Set(['p1']),
				positive: true,
				regions: new Set(['r1', 'r2']),
				types: new Set(['t1']),
				water: 'dry',
			}),
		).toEqual({
			dateFrom: '2026-04-01',
			dateTo: '2026-04-30',
			densities: ['heavy', 'very_heavy'],
			habitatTypeIds: ['t1'],
			inspectedByProfileIds: ['p1'],
			isWet: false,
			positiveOnly: true,
			regionIds: ['r1', 'r2'],
		});
	});
});

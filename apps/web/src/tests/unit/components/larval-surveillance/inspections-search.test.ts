import { describe, expect, it } from 'vitest';
import {
	type InspectionFilters,
	inspectionListParams,
	inspectionTileFilters,
} from '../../../../components/larval-surveillance/inspections-search';
import { mapQueryParams } from '../../../../lib/map-query-params';

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

function paramsFor(filters: Partial<InspectionFilters>) {
	return mapQueryParams(inspectionListParams(inspectionTileFilters({ ...OPEN, ...filters })));
}

describe('inspection list params', () => {
	it('sends nothing for a filter set left open', () => {
		expect(paramsFor({})).toEqual({});
	});

	it('names each filter the way /map/inspections reads it', () => {
		expect(
			paramsFor({
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
			density: 'heavy,very_heavy',
			habitatTypeId: 't1',
			inspectedBy: 'p1',
			isWet: 'false',
			positive: 'true',
			regionId: 'r1,r2',
		});
	});
});

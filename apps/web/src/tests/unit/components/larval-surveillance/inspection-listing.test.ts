import { describe, expect, it } from 'vitest';
import type { InspectionFilterState } from '../../../../components/larval-surveillance/inspection-filters';
import {
	inspectionQueryParams,
	inspectionTileFilters,
} from '../../../../components/larval-surveillance/inspection-listing';
import { mapQueryParams } from '../../../../hooks/explorer/use-paged-map-resource';

const OPEN: InspectionFilterState = {
	dateFrom: '',
	dateTo: '',
	densities: new Set(),
	inspectorIds: new Set(),
	positiveOnly: false,
	regionIds: new Set(),
	typeIds: new Set(),
	wetness: 'all',
};

function paramsFor(state: Partial<InspectionFilterState>) {
	return mapQueryParams(inspectionQueryParams(inspectionTileFilters({ ...OPEN, ...state })));
}

describe('inspection list params', () => {
	it('sends nothing for a filter set left open', () => {
		expect(paramsFor({})).toEqual({});
	});

	it('names each filter the way /map/inspections reads it', () => {
		expect(
			paramsFor({
				dateFrom: '2026-04-01',
				dateTo: '2026-04-30',
				densities: new Set(['heavy', 'very_heavy'] as const),
				inspectorIds: new Set(['p1']),
				positiveOnly: true,
				regionIds: new Set(['r1', 'r2']),
				typeIds: new Set(['t1']),
				wetness: 'dry',
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

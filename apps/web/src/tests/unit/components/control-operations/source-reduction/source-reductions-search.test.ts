import { describe, expect, it } from 'vitest';
import {
	sharedSourceReductionSearch,
	sourceReductionFilterDefaults,
	sourceReductionListParams,
	sourceReductionTileFilters,
} from '../../../../../components/control-operations/source-reduction/source-reductions-search';
import { mapQueryParams } from '../../../../../hooks/explorer/use-paged-map-resource';

/**
 * The Map and the Table send one filter set to `/map/source-reduction`, so this
 * is the one place the translation from the address bar to the request is
 * written.
 */
describe('the source reductions list request', () => {
	it('opens on the last 90 days, ending on the day it is given', () => {
		const params = mapQueryParams(
			sourceReductionListParams(
				sourceReductionTileFilters(sourceReductionFilterDefaults('2026-09-28')),
			),
		);

		expect(params).toEqual({ dateFrom: '2026-07-01', dateTo: '2026-09-28' });
	});

	it('sends every filter the Map has, under the names the endpoint reads', () => {
		const params = mapQueryParams(
			sourceReductionListParams(
				sourceReductionTileFilters({
					from: '2026-09-01',
					to: '2026-09-28',
					methods: new Set(['method-1', 'method-2']),
					people: new Set(['person-1']),
					regions: new Set(['region-1']),
				}),
			),
		);

		expect(params).toEqual({
			sourceReductionMethodId: 'method-1,method-2',
			technician: 'person-1',
			regionId: 'region-1',
			dateFrom: '2026-09-01',
			dateTo: '2026-09-28',
		});
	});
});

describe('what the Map/Table switch carries', () => {
	it('keeps every filter param and drops what is not one', () => {
		expect(
			sharedSourceReductionSearch({
				from: '2026-09-01',
				to: '2026-09-28',
				methods: ['method-1'],
				people: ['person-1'],
				regions: ['region-1'],
				page: 3,
			}),
		).toEqual({
			from: '2026-09-01',
			to: '2026-09-28',
			methods: ['method-1'],
			people: ['person-1'],
			regions: ['region-1'],
		});
	});
});

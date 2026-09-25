import { describe, expect, it } from 'vitest';
import {
	sampleFilterCodecs,
	sampleFilterDefaults,
	sampleListParams,
	sampleTileFilters,
} from '../../../../components/larval-surveillance/samples-search';
import { mapQueryParams } from '../../../../hooks/explorer/use-paged-map-resource';
import { resolveFilters } from '../../../../lib/search-filters';

describe('the samples filter contract', () => {
	it('opens on every status over the last thirty days, today included', () => {
		const defaults = sampleFilterDefaults('2026-09-24');

		expect(resolveFilters(defaults, sampleFilterCodecs, {})).toMatchObject({
			status: 'all',
			from: '2026-08-26',
			to: '2026-09-24',
		});
	});

	it('sends the opening window and nothing else to `/map/samples`', () => {
		const params = mapQueryParams(
			sampleListParams(sampleTileFilters(sampleFilterDefaults('2026-09-24'))),
		);

		expect(params).toEqual({ dateFrom: '2026-08-26', dateTo: '2026-09-24' });
	});

	it('sends every filter the Map has, under the names the endpoint reads', () => {
		const params = mapQueryParams(
			sampleListParams(
				sampleTileFilters({
					from: '',
					to: '',
					status: 'awaiting',
					species: new Set(['species-1']),
					nonMosquito: true,
					regions: new Set(['region-1']),
				}),
			),
		);

		expect(params).toEqual({
			status: 'awaiting',
			species: 'species-1',
			nonMosquito: 'true',
			regionId: 'region-1',
		});
	});
});

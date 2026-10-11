import { describe, expect, it } from 'vitest';
import {
	sampleFilterCodecs,
	sampleFilterDefaults,
	sampleTileFilters,
} from '../../../../components/larval-surveillance/samples-search';
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

	it('carries the opening window and nothing else to the tiles', () => {
		expect(sampleTileFilters(sampleFilterDefaults('2026-09-24'))).toEqual({
			dateFrom: '2026-08-26',
			dateTo: '2026-09-24',
		});
	});

	it('carries every filter the Map has to the tiles', () => {
		expect(
			sampleTileFilters({
				from: '',
				to: '',
				status: 'awaiting',
				species: new Set(['species-1']),
				nonMosquito: true,
				regions: new Set(['region-1']),
			}),
		).toEqual({
			status: 'awaiting',
			speciesIds: ['species-1'],
			nonMosquitoOnly: true,
			regionIds: ['region-1'],
		});
	});
});

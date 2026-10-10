import { describe, expect, it } from 'vitest';
import {
	TRAP_FILTER_DEFAULTS,
	trapListParams,
	trapTileFilters,
} from '../../../../../components/adult-surveillance/traps/traps-search';
import { mapQueryParams } from '../../../../../lib/map-query-params';

/**
 * The Map and the Table send one filter set to `/map/traps`, so this is the
 * one place the translation from the address bar to the request is written.
 */
describe('the traps list request', () => {
	it('asks for active traps and nothing else when no filter is set', () => {
		const params = mapQueryParams(trapListParams(trapTileFilters(TRAP_FILTER_DEFAULTS)));

		expect(params).toEqual({ status: 'active' });
	});

	it('sends every filter the Map has, under the names the endpoint reads', () => {
		const params = mapQueryParams(
			trapListParams(
				trapTileFilters({
					search: 'Gravid',
					status: 'inactive',
					methods: new Set(['method-1', 'method-2']),
					regions: new Set(['region-1']),
				}),
			),
		);

		expect(params).toEqual({
			status: 'inactive',
			collectionMethodId: 'method-1,method-2',
			regionId: 'region-1',
			search: 'Gravid',
		});
	});

	it('leaves Status off when it is All', () => {
		const params = mapQueryParams(
			trapListParams(trapTileFilters({ ...TRAP_FILTER_DEFAULTS, status: 'all' })),
		);

		expect(params).toEqual({});
	});
});

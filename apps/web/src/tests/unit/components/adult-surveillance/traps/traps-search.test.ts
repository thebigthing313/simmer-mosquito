import { describe, expect, it } from 'vitest';
import {
	TRAP_FILTER_DEFAULTS,
	trapTileFilters,
} from '../../../../../components/adult-surveillance/traps/traps-search';

/**
 * The Map and the Table send one filter set to `/map/traps`, built from these
 * tile filters. The wire names are the shared spec's, and the round trip in
 * `apps/server` holds them.
 */
describe('the traps tile filters', () => {
	it('ask for active traps and nothing else when no filter is set', () => {
		expect(trapTileFilters(TRAP_FILTER_DEFAULTS)).toEqual({ isActive: true });
	});

	it('carry every filter the Map has', () => {
		expect(
			trapTileFilters({
				search: 'Gravid',
				status: 'inactive',
				methods: new Set(['method-1', 'method-2']),
				regions: new Set(['region-1']),
			}),
		).toEqual({
			isActive: false,
			collectionMethodIds: ['method-1', 'method-2'],
			regionIds: ['region-1'],
			search: 'Gravid',
		});
	});

	it('leave Status off when it is All', () => {
		expect(trapTileFilters({ ...TRAP_FILTER_DEFAULTS, status: 'all' })).toEqual({});
	});
});

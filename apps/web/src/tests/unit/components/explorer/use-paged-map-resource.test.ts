import { describe, expect, it } from 'vitest';
import { mapQueryParams } from '../../../../components/explorer/use-paged-map-resource';

/**
 * The `/map/*` list endpoints read presence, so an absent filter has to leave its
 * param out rather than send a blank one. Every explorer used to spell that rule
 * out by hand, once per filter (#101).
 */
describe('mapQueryParams', () => {
	it('drops absent, empty, and empty-list values', () => {
		expect(
			mapQueryParams({
				regionId: [],
				dateFrom: undefined,
				dateTo: '',
				search: null,
				status: 'active',
			}),
		).toEqual({ status: 'active' });
	});

	it('joins id lists the way the endpoints parse them', () => {
		expect(mapQueryParams({ regionId: ['a', 'b', 'c'] })).toEqual({ regionId: 'a,b,c' });
	});

	// `isWet=false` is a real filter — dry inspections — not an absent one.
	it('keeps a false flag rather than treating it as unset', () => {
		expect(mapQueryParams({ isWet: false, positive: true })).toEqual({
			isWet: 'false',
			positive: 'true',
		});
	});
});

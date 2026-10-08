import { describe, expect, it } from 'vitest';
import { serviceRequestPageParams } from '../../../../../components/public-engagement/service-requests/service-request-listing';
import { mapQueryParams } from '../../../../../hooks/explorer/use-paged-map-resource';

describe('serviceRequestPageParams', () => {
	it('leaves newest first unsent', () => {
		expect(mapQueryParams(serviceRequestPageParams({}, 'newest'))).toEqual({});
	});

	it('asks for oldest first by name', () => {
		expect(mapQueryParams(serviceRequestPageParams({}, 'oldest'))).toEqual({ oldest: 'true' });
	});

	it('names each filter the way /map/service-requests reads it', () => {
		expect(
			mapQueryParams(
				serviceRequestPageParams(
					{
						dateFrom: '2026-01-01',
						dateTo: '2026-12-31',
						isOpen: false,
						regionIds: ['r1'],
						search: 'bees',
						tagIds: ['t1', 't2'],
					},
					'newest',
				),
			),
		).toEqual({
			dateFrom: '2026-01-01',
			dateTo: '2026-12-31',
			regionId: 'r1',
			search: 'bees',
			status: 'closed',
			tagId: 't1,t2',
		});
	});
});

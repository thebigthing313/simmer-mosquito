import { describe, expect, it } from 'vitest';
import { buildServiceRequestTileUrl } from '../../../../../components/map/service-request-tiles';
import {
	serviceRequestPageParams,
	serviceRequestTileFilters,
} from '../../../../../components/public-engagement/service-requests/service-request-listing';
import { mapQueryParams } from '../../../../../hooks/explorer/use-paged-map-resource';

describe('serviceRequestTileFilters', () => {
	const window = { status: 'all', from: '2026-01-01', to: '2026-10-20' } as const;

	it('sends the overdue cut-off with the date window when Overdue is on', () => {
		expect(serviceRequestTileFilters({ ...window, overdue: true }, '2026-10-06')).toEqual({
			dateFrom: '2026-01-01',
			dateTo: '2026-10-20',
			overdueBefore: '2026-10-06',
		});
	});

	it('sends no cut-off with Overdue off', () => {
		expect(
			serviceRequestTileFilters({ ...window, overdue: false }, '2026-10-06'),
		).not.toHaveProperty('overdueBefore');
	});

	it('sends no cut-off with the threshold off, even when the address asks for Overdue', () => {
		expect(serviceRequestTileFilters({ ...window, overdue: true }, null)).not.toHaveProperty(
			'overdueBefore',
		);
	});

	it('asks the page and the tiles for the same overdue requests', () => {
		const filters = serviceRequestTileFilters({ ...window, overdue: true }, '2026-10-06');

		expect(mapQueryParams(serviceRequestPageParams(filters, 'newest'))).toMatchObject({
			overdueBefore: '2026-10-06',
		});
		expect(buildServiceRequestTileUrl('https://api.test', filters)).toContain(
			'overdueBefore=2026-10-06',
		);
	});
});

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

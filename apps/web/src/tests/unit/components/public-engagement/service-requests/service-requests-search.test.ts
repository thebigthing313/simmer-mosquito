import { describe, expect, it } from 'vitest';
import { recordSetFilterParams } from '../../../../../components/explorer/record-set';
import {
	buildServiceRequestExtentUrl,
	buildServiceRequestTileUrl,
} from '../../../../../components/map/service-request-tiles';
import {
	serviceRequestFilterCodecs,
	serviceRequestFilterDefaults,
	serviceRequestOrderParams,
	serviceRequestRecordSet,
	serviceRequestTileFilters,
} from '../../../../../components/public-engagement/service-requests/service-requests-search';
import { resolveFilters, searchValidator } from '../../../../../lib/search-filters';

describe('the service requests filter contract', () => {
	it('opens on every status, this year to date', () => {
		const defaults = serviceRequestFilterDefaults('2026-09-15');

		expect(resolveFilters(defaults, serviceRequestFilterCodecs, {})).toMatchObject({
			status: 'all',
			from: '2026-01-01',
			to: '2026-09-15',
		});
	});

	it('reads All time as no bound at either end', () => {
		const defaults = serviceRequestFilterDefaults('2026-09-15');

		expect(
			resolveFilters(defaults, serviceRequestFilterCodecs, { from: 'any', to: 'any' }),
		).toMatchObject({ from: '', to: '' });
	});

	it('keeps the default status off the address bar and a chosen one on it', () => {
		const validate = searchValidator(serviceRequestFilterCodecs);

		expect(validate({ status: 'all' })).toEqual({});
		expect(validate({ status: 'open' })).toEqual({ status: 'open' });
	});

	it('opens with Overdue off and keeps it off the address bar until it is on', () => {
		const defaults = serviceRequestFilterDefaults('2026-09-15');
		const validate = searchValidator(serviceRequestFilterCodecs);

		expect(defaults.overdue).toBe(false);
		expect(validate({ overdue: false })).toEqual({});
		expect(validate({ overdue: true })).toEqual({ overdue: true });
		expect(resolveFilters(defaults, serviceRequestFilterCodecs, { overdue: 'true' })).toMatchObject(
			{ overdue: true },
		);
	});
});

describe('serviceRequestTileFilters', () => {
	const window = {
		status: 'all',
		search: '',
		tags: new Set<string>(),
		regions: new Set<string>(),
		from: '2026-01-01',
		to: '2026-10-20',
	} as const;

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

		expect(recordSetFilterParams(serviceRequestRecordSet, filters)).toMatchObject({
			overdueBefore: '2026-10-06',
		});
		expect(buildServiceRequestTileUrl('https://api.test', filters)).toContain(
			'overdueBefore=2026-10-06',
		);
	});
});

describe('serviceRequestOrderParams', () => {
	it('leaves newest first unsent', () => {
		expect(serviceRequestOrderParams('newest')).toEqual({});
	});

	it('asks for oldest first by name', () => {
		expect(serviceRequestOrderParams('oldest')).toEqual({ oldest: 'true' });
	});

	it('never reaches the tile or the extent URL, which the order does not narrow', () => {
		const filters = serviceRequestTileFilters(
			{
				status: 'open',
				search: '',
				tags: new Set<string>(),
				regions: new Set<string>(),
				from: '',
				to: '',
				overdue: false,
			},
			null,
		);

		expect(buildServiceRequestTileUrl('https://api.test', filters)).not.toContain('oldest');
		expect(buildServiceRequestExtentUrl('https://api.test', filters)).not.toContain('oldest');
	});
});

import { describe, expect, it } from 'vitest';
import {
	serviceRequestFilterCodecs,
	serviceRequestFilterDefaults,
	sharedServiceRequestSearch,
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

	it('carries status and dates between the two surfaces and nothing else', () => {
		expect(
			sharedServiceRequestSearch({
				status: 'closed',
				search: 'garage',
				tags: ['tag-1'],
				regions: ['region-1'],
				from: '2026-08-01',
				to: 'any',
				sort: 'number',
			}),
		).toEqual({ status: 'closed', from: '2026-08-01', to: 'any' });
	});
});

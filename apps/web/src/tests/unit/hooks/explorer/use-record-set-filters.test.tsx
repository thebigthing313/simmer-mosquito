/** @vitest-environment jsdom */

/**
 * The filters one surface of a record set binds to the URL. What is held here
 * is the rule `defineRecordSet` states, that a surface holds only the keys it
 * applies: a filter the surface does not apply reads as unset and counts
 * nothing even when a hand-typed address carries it. And a set with a text
 * filter gets the search box that types ahead of the URL, on the surfaces that
 * apply it.
 */

import { resolveOrganizationSettings } from '@simmer-mosquito/domain';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { trapRecordSet } from '../../../../components/adult-surveillance/traps/traps-search';
import { inspectionRecordSet } from '../../../../components/larval-surveillance/inspections-search';
import { serviceRequestRecordSet } from '../../../../components/public-engagement/service-requests/service-requests-search';
import { useRecordSetFilters } from '../../../../hooks/explorer/use-record-set-filters';

const harness = vi.hoisted(() => ({
	search: {} as Record<string, unknown>,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../../routes/route-mock-stand-ins');
	return routerStandIn(
		await importOriginal<object>(),
		() => harness.search,
		() => ({}),
		{
			setSearch: (next) => {
				harness.search = next;
			},
		},
	);
});

vi.mock('../../../../hooks/queries/use-organization-settings', () => ({
	useOrganizationSettings: () =>
		resolveOrganizationSettings({ timezone: 'America/New_York' }).settings,
}));

beforeEach(() => {
	harness.search = {};
	vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
	vi.setSystemTime(new Date('2026-10-09T16:00:00Z'));
});

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('the Inspections surfaces', () => {
	it('open the Map on the last 30 days and the Table on all time', () => {
		const map = renderHook(() => useRecordSetFilters(inspectionRecordSet, 'map'));
		const table = renderHook(() => useRecordSetFilters(inspectionRecordSet, 'table'));

		expect(map.result.current.today).toBe('2026-10-09');
		expect(map.result.current.filters).toMatchObject({ from: '2026-09-10', to: '2026-10-09' });
		expect(table.result.current.filters).toMatchObject({ from: '', to: '' });
	});

	it('read a Region on the address on the Map and not on the Table', () => {
		harness.search = { regions: ['region-1'] };

		const map = renderHook(() => useRecordSetFilters(inspectionRecordSet, 'map'));
		const table = renderHook(() => useRecordSetFilters(inspectionRecordSet, 'table'));

		expect([...map.result.current.filters.regions]).toEqual(['region-1']);
		expect(map.result.current.activeCount).toBe(1);
		expect(table.result.current.filters.regions.size).toBe(0);
		expect(table.result.current.activeCount).toBe(0);
	});

	it('take a Region off the address when the Table writes one', () => {
		harness.search = { water: 'wet' };
		const table = renderHook(() => useRecordSetFilters(inspectionRecordSet, 'table'));

		act(() => table.result.current.setFilters({ regions: new Set(['region-1']) }));

		expect(harness.search).toEqual({ water: 'wet' });
	});
});

describe('the Traps search box', () => {
	it('commits what was typed once typing stops', () => {
		const { result } = renderHook(() => useRecordSetFilters(trapRecordSet, 'map'));

		act(() => result.current.setSearchInput('gravid'));
		expect(result.current.searchInput).toBe('gravid');
		expect(harness.search).toEqual({});

		act(() => vi.advanceTimersByTime(200));

		expect(harness.search).toEqual({ search: 'gravid' });
		expect(result.current.filters.search).toBe('gravid');
		expect(result.current.activeCount).toBe(1);
	});

	it('empties the box and drops every filter on Clear all', () => {
		harness.search = { search: 'gravid', status: 'all' };
		const { result } = renderHook(() => useRecordSetFilters(trapRecordSet, 'table'));
		expect(result.current.searchInput).toBe('gravid');

		act(() => result.current.clearAll());

		expect(result.current.searchInput).toBe('');
		expect(harness.search).toEqual({});
	});
});

describe('the Service Requests Table search box', () => {
	it('commits nothing, because the Table does not apply Search', () => {
		const { result } = renderHook(() => useRecordSetFilters(serviceRequestRecordSet, 'table'));

		act(() => result.current.setSearchInput('ditch'));
		act(() => vi.advanceTimersByTime(1000));

		expect(harness.search).toEqual({});
	});
});

/** @vitest-environment jsdom */

/**
 * The service requests table's read.
 *
 * The same two things `use-inspection-table.test.tsx` holds: the order is a
 * column of `service_requests` and then `created_at`, so the window pages by
 * cursor, and the joins are `left`, so a request whose Contact or Address has
 * not streamed in stays on the table. The filters are the other half: Status
 * and the date window, each a column of the request.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_SERVICE_REQUEST_SORT,
	SERVICE_REQUEST_SORT_KEYS,
	type ServiceRequestSort,
	type ServiceRequestTableFilters,
	serviceRequestWindowKey,
	useServiceRequestTable,
} from '../../../../hooks/queries/use-service-request-table';
import { addresses } from '../../../../lib/collections/addresses';
import { contacts } from '../../../../lib/collections/contacts';
import { profiles } from '../../../../lib/collections/profiles';
import { service_requests } from '../../../../lib/collections/service_requests';
import { SORT_DIRECTIONS } from '../../../../lib/table-sort';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

const CONTACT_ID = 'c1b2c3d4-0000-4000-8000-000000000001';
const ADDRESS_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const PROFILE_ID = 'p1b2c3d4-0000-4000-8000-000000000001';

/** Every filter off: the whole set, in the sort's order. */
const NO_FILTERS: ServiceRequestTableFilters = { isOpen: null, dateFrom: '', dateTo: '' };

/**
 * A request received by phone on 12 August, still open. Every column is
 * present, because a projection reading a column the fixture omits reads
 * `undefined`, which is also what an unmatched join reads.
 */
function request(
	id: string,
	overrides: {
		readonly display_name?: number | null;
		readonly request_date?: string;
		readonly closed_at?: Date | null;
		readonly created_at?: Date;
		readonly contact_id?: string;
		readonly received_by_profile_id?: string | null;
	} = {},
) {
	return {
		id,
		organization_id: 'org-1',
		display_name: 1,
		intake_type: 'phone',
		request_date: '2026-08-12',
		lat: 34.1,
		lng: -118.2,
		geom_type: 'Point',
		address_id: ADDRESS_ID,
		contact_id: CONTACT_ID,
		received_by_profile_id: PROFILE_ID,
		details: 'Standing water behind the garage.',
		closed_at: null,
		closed_by_profile_id: null,
		metadata: null,
		created_by_profile_id: null,
		updated_by_profile_id: null,
		created_at: new Date('2026-08-12T12:00:00Z'),
		updated_at: new Date('2026-08-12T12:00:00Z'),
		...overrides,
	};
}

beforeEach(() => {
	installMemoryCollections();
	seedRows(contacts, [
		{
			id: CONTACT_ID,
			contact_name: 'Dana Okafor',
			company: null,
			email: null,
			preferred_phone: null,
		},
	]);
	seedRows(addresses, [
		{
			id: ADDRESS_ID,
			display_name: null,
			address_line_1: '12 Alder Street',
			address_line_2: null,
			locality: 'Pasadena',
			region: 'CA',
			postal_code: '91101',
		},
	]);
	seedRows(profiles, [{ id: PROFILE_ID, display_name: 'Rosa Lam' }]);
});

async function renderTable(
	limit: number,
	sort: ServiceRequestSort = DEFAULT_SERVICE_REQUEST_SORT,
	filters: ServiceRequestTableFilters = NO_FILTERS,
) {
	const { result } = await renderRead(() => useServiceRequestTable(sort, limit, filters));
	return result;
}

async function idsOf(
	options: {
		readonly limit?: number;
		readonly sort?: ServiceRequestSort;
		readonly filters?: Partial<ServiceRequestTableFilters>;
	} = {},
): Promise<string[]> {
	const result = await renderTable(options.limit ?? 10, options.sort, {
		...NO_FILTERS,
		...options.filters,
	});
	return result.current.rows.map((row) => row.id);
}

describe('useServiceRequestTable', () => {
	it('opens by request date descending, newest entry first within a date', async () => {
		seedRows(service_requests, [
			request('old', { request_date: '2026-08-10' }),
			request('early', { created_at: new Date('2026-08-12T08:00:00Z') }),
			request('late', { created_at: new Date('2026-08-12T17:00:00Z') }),
		]);

		expect(await idsOf()).toEqual(['late', 'early', 'old']);
	});

	it('returns the newest rows up to the limit', async () => {
		seedRows(service_requests, [
			request('r1', { request_date: '2026-08-10' }),
			request('r2', { request_date: '2026-08-12' }),
			request('r3', { request_date: '2026-08-11' }),
		]);

		expect(await idsOf({ limit: 2 })).toEqual(['r2', 'r3']);
	});

	it('sorts by number, with an unnumbered request at the bottom either way', async () => {
		seedRows(service_requests, [
			request('seven', { display_name: 7 }),
			request('none', { display_name: null }),
			request('forty', { display_name: 40 }),
		]);

		expect(await idsOf({ sort: { key: 'number', direction: 'desc' } })).toEqual([
			'forty',
			'seven',
			'none',
		]);
		expect(await idsOf({ sort: { key: 'number', direction: 'asc' } })).toEqual([
			'seven',
			'forty',
			'none',
		]);
	});

	it('narrows to open or to closed requests', async () => {
		seedRows(service_requests, [
			request('open'),
			request('closed', { closed_at: new Date('2026-08-20T15:00:00Z') }),
		]);

		expect(await idsOf({ filters: { isOpen: true } })).toEqual(['open']);
		expect(await idsOf({ filters: { isOpen: false } })).toEqual(['closed']);
		expect(await idsOf({ filters: { isOpen: null } })).toHaveLength(2);
	});

	it('narrows to the date window, both ends inclusive', async () => {
		seedRows(service_requests, [
			request('before', { request_date: '2025-12-31' }),
			request('first', { request_date: '2026-01-01' }),
			request('last', { request_date: '2026-09-15' }),
			request('after', { request_date: '2026-09-16' }),
		]);

		expect(await idsOf({ filters: { dateFrom: '2026-01-01', dateTo: '2026-09-15' } })).toEqual([
			'last',
			'first',
		]);
	});

	it('names the contact, the address and who took it through the joins', async () => {
		seedRows(service_requests, [request('r1')]);

		const result = await renderTable(10);

		const row = result.current.rows[0];
		expect(row?.contact.contactName).toBe('Dana Okafor');
		expect(row?.address.addressLine1).toBe('12 Alder Street');
		expect(row?.receivedByName).toBe('Rosa Lam');
		expect(row?.closedAt).toBeNull();
	});

	it('keeps a request whose contact has not arrived, and one nobody took', async () => {
		seedRows(service_requests, [
			request('r1', {
				contact_id: 'c1b2c3d4-0000-4000-8000-00000000ffff',
				received_by_profile_id: null,
			}),
		]);

		const result = await renderTable(10);

		const row = result.current.rows[0];
		expect(row?.id).toBe('r1');
		expect(row?.contact.id).toBeUndefined();
		expect(row?.receivedByName).toBeNull();
	});

	it.each(
		SERVICE_REQUEST_SORT_KEYS.flatMap((key) =>
			SORT_DIRECTIONS.map((direction) => ({ direction, key })),
		),
	)('pages the window lazily when sorted by $key $direction', async (sort) => {
		// `use-inspection-table.test.tsx` says why the warning is the assertion: a
		// sort the cursor cannot follow loads the whole set with nothing thrown.
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		seedRows(service_requests, [request('r1')]);

		await renderTable(10, sort);
		await renderTable(10, sort, { isOpen: true, dateFrom: '2026-01-01', dateTo: '2026-12-31' });

		const complaints = warn.mock.calls
			.map((call) => String(call[0]))
			.filter((message) => message.includes('requires an index'));
		warn.mockRestore();
		expect(complaints).toEqual([]);
	});
});

describe('serviceRequestWindowKey', () => {
	it('is a different window under a different sort or filter', () => {
		const base = serviceRequestWindowKey(DEFAULT_SERVICE_REQUEST_SORT, NO_FILTERS);

		expect(serviceRequestWindowKey({ key: 'number', direction: 'desc' }, NO_FILTERS)).not.toBe(
			base,
		);
		expect(
			serviceRequestWindowKey(DEFAULT_SERVICE_REQUEST_SORT, { ...NO_FILTERS, isOpen: true }),
		).not.toBe(base);
		expect(serviceRequestWindowKey(DEFAULT_SERVICE_REQUEST_SORT, NO_FILTERS)).toBe(base);
	});
});

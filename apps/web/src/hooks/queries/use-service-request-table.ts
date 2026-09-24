/**
 * A window of Service Requests, in the order the reader asked for and narrowed
 * to what the reader asked about.
 *
 * The service requests table's read, built the way the inspections table's is:
 * `service_requests` is on-demand, so an `orderBy` with a `limit` is sent to the
 * shape proxy as `order_by` and `limit`, Postgres does the sorting, and the
 * browser holds one window of rows. `use-inspection-table.ts` carries the
 * mechanism and the traps; the two rules that follow from it are repeated here
 * because this file has to keep them too.
 *
 * Every sort key and every filter names a column of `service_requests`. A sort
 * or a predicate on a joined column moves the window's cursor onto the joined
 * collection and pulls the whole Organization's history into the browser.
 *
 * The three joins are labels only. `contacts` and `addresses` are on-demand and
 * the compiler asks each for the join keys this window produced; `profiles` is
 * eager.
 *
 * `useLiveQuery` rather than the suspense variant: the suspense hook hangs after
 * a navigation unmount over an on-demand collection.
 */

import {
	and,
	caseWhen,
	coalesce,
	eq,
	gte,
	isNull,
	lte,
	not,
	useLiveQuery,
} from '@tanstack/react-db';
import { addresses } from '../../lib/collections/addresses';
import { contacts } from '../../lib/collections/contacts';
import { profiles } from '../../lib/collections/profiles';
import { service_requests } from '../../lib/collections/service_requests';
import type { TableSort } from '../../lib/table-sort';
import type { LinkedAddress } from './address-view';
import type { LinkedContact } from './contact-view';
import { addressSelect } from './shared';

/**
 * What the table sorts by. All three are columns of `service_requests`: `date`
 * is `request_date`, `number` is `display_name`, the `#` a request is known by,
 * and `age` is `request_date` read the other way round, so the oldest request is
 * the one with the greatest age. The keys are the URL's vocabulary, so
 * `?sort=number`, not `?sort=display_name`.
 */
export const SERVICE_REQUEST_SORT_KEYS = ['date', 'number', 'age'] as const;

export type ServiceRequestSortKey = (typeof SERVICE_REQUEST_SORT_KEYS)[number];

export type ServiceRequestSort = TableSort<ServiceRequestSortKey>;

/** What the table opens on, and what a reset returns it to. */
export const DEFAULT_SERVICE_REQUEST_SORT: ServiceRequestSort = { key: 'date', direction: 'desc' };

/**
 * What the reader has narrowed the table to.
 *
 * Status and the date window, and nothing else, because those are the two the
 * map shares that are columns of `service_requests`. The map's Search, Tag and
 * Region filters are answered by the server's `/map/service-requests` predicate:
 * search reads the contact and the address as well as the request, a Tag is a
 * row in `entity_tags`, and a Region is ADR 0015's spatial membership. A
 * collection `where` can say none of the three against the window's own table.
 */
export interface ServiceRequestTableFilters {
	/** `null` takes open and closed alike. */
	readonly isOpen: boolean | null;
	/** Inclusive bound on `request_date`. `''` is no bound at that end. */
	readonly dateFrom: string;
	readonly dateTo: string;
}

/** One Service Request as the table draws it. */
export interface ServiceRequestTableRow {
	readonly id: string;
	readonly displayName: number | null;
	readonly requestDate: string;
	readonly intakeType: string;
	readonly details: string;
	readonly closedAt: Date | null;
	readonly receivedByName: string | null;
	/** Joined, not looked up. `address-view.ts` says why it is nested here. */
	readonly contact: LinkedContact;
	readonly address: LinkedAddress;
}

/**
 * The identity of the window on screen: the sort it was read under and the
 * filters it was read through. `inspectionWindowKey` says why a window belongs
 * to one query.
 */
export function serviceRequestWindowKey(
	sort: ServiceRequestSort,
	filters: ServiceRequestTableFilters,
): string {
	return [
		sort.key,
		sort.direction,
		filters.isOpen === null ? 'any' : String(filters.isOpen),
		filters.dateFrom,
		filters.dateTo,
		// A separator no date or key can contain, written as an escape for the
		// reason `inspectionWindowKey` gives.
	].join('\u0000');
}

/** The direction the column is read in: an age runs the other way to its date. */
function columnDirection(sort: ServiceRequestSort): ServiceRequestSort['direction'] {
	if (sort.key !== 'age') {
		return sort.direction;
	}
	return sort.direction === 'asc' ? 'desc' : 'asc';
}

export function useServiceRequestTable(
	sort: ServiceRequestSort,
	limit: number,
	filters: ServiceRequestTableFilters,
): {
	readonly rows: readonly ServiceRequestTableRow[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery({
		query: (query) =>
			query
				.from({ request: service_requests() })
				.where(({ request }) => {
					const clauses = [
						filters.isOpen === null
							? null
							: filters.isOpen
								? isNull(request.closed_at)
								: not(isNull(request.closed_at)),
						filters.dateFrom === '' ? null : gte(request.request_date, filters.dateFrom),
						filters.dateTo === '' ? null : lte(request.request_date, filters.dateTo),
					].filter((clause) => clause !== null);
					const [first, second, ...rest] = clauses;
					if (first === undefined) {
						// `id` is the primary key, so `IS NOT NULL` over it is every row.
						return not(isNull(request.id));
					}
					return second === undefined ? first : and(first, second, ...rest);
				})
				// `left` throughout: a Profile need not be recorded as having taken the
				// request, and a Contact or an Address can still be streaming in.
				.join(
					{ contact: contacts() },
					({ request, contact }) => eq(request.contact_id, contact.id),
					'left',
				)
				.join(
					{ address: addresses() },
					({ request, address }) => eq(request.address_id, address.id),
					'left',
				)
				.join(
					{ receiver: profiles() },
					({ request, receiver }) => eq(request.received_by_profile_id, receiver.id),
					'left',
				)
				.orderBy(
					({ request }) => {
						const columns = {
							date: request.request_date,
							number: request.display_name,
							age: request.request_date,
						} satisfies Record<ServiceRequestSortKey, unknown>;
						return columns[sort.key];
					},
					// `nulls` is part of what the collection's index is built with, so
					// Postgres and the browser are told the same thing.
					{ direction: columnDirection(sort), nulls: 'last' },
				)
				// Breaks the tie within one date, so the rows do not move under the
				// reader as the next window arrives.
				.orderBy(({ request }) => request.created_at, 'desc')
				.limit(limit)
				.select(({ request, contact, address, receiver }) => ({
					id: request.id,
					displayName: request.display_name,
					requestDate: request.request_date,
					intakeType: request.intake_type,
					details: request.details,
					closedAt: coalesce(request.closed_at, null),
					// Guarded on the request's own column: an unmatched `left` join
					// yields `undefined`, and the row speaks `null`.
					receivedByName: caseWhen(
						isNull(request.received_by_profile_id),
						null,
						receiver.display_name,
					),
					// `id` is the discriminator, as it is for an address: `undefined`
					// means the joined row is still streaming.
					contact: {
						id: contact.id,
						contactName: contact.contact_name,
						company: contact.company,
						email: contact.email,
						preferredPhone: contact.preferred_phone,
					},
					address: addressSelect(address),
				})),
	});

	return { rows: result.data, isReady: result.isReady, isError: result.isError };
}

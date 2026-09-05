/**
 * Every Service Request the organization has, newest first.
 *
 * One subset serves the whole public-engagement domain — the overview's open list
 * and activity feed, and the explorer's list, map and filters — because they all
 * ask about the same rows from different angles, and a second org-scoped query
 * over the same table would double the sync for nothing.
 *
 * ## No contacts, no addresses
 *
 * Deliberately. Both are on-demand, and joining them here would make the
 * planner ask for the contact and address of *every* request the organization
 * has ever taken — a subset request whose id list grows with the season and
 * eventually fails (`docs/sync.md`, and the nested-include failures on the
 * larval overview). `useRequestParties` resolves them for a bounded set of rows
 * instead, which is what both surfaces already do: the overview asks for its
 * six previewed rows, the explorer for its page of twenty-five.
 *
 * ## No org predicate
 *
 * The shape is already scoped to the organization server-side — the proxy
 * forces the scope and ignores anything the caller asks for. Filtering by
 * `organization_id` here re-states server-side authorization as a client-side
 * filter, which is both redundant and what broke when the column name changed:
 * the predicate compiled against a column that no longer existed, and Electric
 * rejected the shape.
 *
 * Open/closed is decided by the caller rather than in the predicate: `closedAt`
 * is a timestamp, not a flag, and every surface wants the closed ones too.
 */

import { useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { service_requests } from '../../lib/collections/service_requests';
import { activityGcTimeMs } from './shared';

/** A Service Request as a list of them shows one. */
export interface RequestListing {
	readonly id: string;
	readonly displayName: number | null;
	readonly requestDate: string;
	readonly details: string;
	readonly contactId: string;
	readonly addressId: string;
	readonly latitude: number;
	readonly longitude: number;
	readonly createdAt: Date;
	readonly createdByProfileId: string | null;
	readonly closedAt: Date | null;
	readonly closedByProfileId: string | null;
}

export function useOrganizationServiceRequests(): {
	readonly requests: readonly RequestListing[];
	readonly openRequests: readonly RequestListing[];
	readonly openCount: number;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ request: service_requests() })
					.orderBy(({ request }) => request.request_date, 'desc')
					.select(({ request }) => ({
						id: request.id,
						displayName: request.display_name,
						requestDate: request.request_date,
						details: request.details,
						contactId: request.contact_id,
						addressId: request.address_id,
						latitude: request.lat,
						longitude: request.lng,
						createdAt: request.created_at,
						createdByProfileId: request.created_by_profile_id,
						closedAt: request.closed_at,
						closedByProfileId: request.closed_by_profile_id,
					})),
		},
		[],
	);

	const requests = result.data;
	const openRequests = useMemo(
		() => requests.filter((request) => request.closedAt === null),
		[requests],
	);

	return {
		requests,
		openRequests,
		openCount: openRequests.length,
		isReady: result.isReady,
		isError: result.isError,
	};
}

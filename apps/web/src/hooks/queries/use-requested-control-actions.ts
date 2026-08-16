/**
 * Requests for control raised within a window.
 *
 * The queue and the operations overview. Control type, status, and requester are
 * filtered by the caller in memory rather than here: status derives from a
 * nullable timestamp rather than a column, and re-narrowing the shape on every
 * filter change would re-stream the whole window each time.
 *
 * The method and requester names are not joined. Both come from eager catalogs
 * the pages already hold — the four method tables for the filter options, the
 * profiles for the assignee picker — so a join would fetch nothing new and would
 * make the list wait on a lookup it already has.
 */

import { and, gte, lte, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { requested_control_actions } from '../../lib/collections/requested_control_actions';
import { addCalendarDays, localDayStartAsInstant } from '../../lib/local-date';
import { useOrganizationTimeZone } from '../use-organization-time-zone';
import type { RequestListing } from './operations-view';
import { activityGcTimeMs } from './shared';

/**
 * The bounds an unset half of the window gets.
 *
 * `dateParam` encodes "no bound" as an empty string, and the column is a
 * `timestamptz`, so the absent side needs an instant every real row falls inside
 * rather than a sentinel date. They are built directly rather than by widening a
 * sentinel `YYYY-MM-DD`: the upper bound is the day *after* the one asked for,
 * and a year 9999 plus a day is year 10000, which `Date#toISOString` renders as
 * `+010000-01-01` — a string the calendar-date reader does not recognise, so the
 * bound silently collapsed to the epoch and cleared the list.
 */
const EARLIEST_INSTANT = new Date(0);
const LATEST_INSTANT = new Date('9999-12-31T00:00:00.000Z');

export function useRequestedControlActions(
	from: string,
	to: string,
): {
	readonly requests: readonly RequestListing[];
	readonly isLoading: boolean;
	readonly isReady: boolean;
} {
	const timeZone = useOrganizationTimeZone();
	const fromBound = useMemo(
		() => (from === '' ? EARLIEST_INSTANT : localDayStartAsInstant(from, timeZone)),
		[from, timeZone],
	);
	// The upper bound is the start of the day *after* `to`, so a request raised at
	// any hour of the closing day is still inside the window.
	const toBound = useMemo(
		() => (to === '' ? LATEST_INSTANT : localDayStartAsInstant(addCalendarDays(to, 1), timeZone)),
		[to, timeZone],
	);

	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ request: requested_control_actions })
					.where(({ request }) =>
						and(gte(request.requested_at, fromBound), lte(request.requested_at, toBound)),
					)
					.orderBy(({ request }) => request.requested_at, 'desc')
					.select(({ request }) => ({
						id: request.id,
						controlType: request.control_type,
						summary: request.summary,
						recommendedMethodId: request.recommended_method_id,
						requestedByProfileId: request.requested_by_profile_id,
						requestedAt: request.requested_at,
						resolvedAt: request.resolved_at,
						lat: request.lat,
						lng: request.lng,
					})),
		},
		[fromBound, toBound],
	);

	return { requests: result.data, isLoading: result.isLoading, isReady: result.isReady };
}

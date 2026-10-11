/**
 * The organization's service-request activity over a window, newest first.
 *
 * Each kind comes off a column that means exactly what it says: a receipt off
 * `request_date` and `received_by_profile_id`, a close off `closed_at`, and a
 * comment off its own `commented_at`.
 *
 * **A receipt is the request date, not the row.** `CONTEXT.md` says a Service
 * Request is received on its request date and counts on that day, and that when
 * the row was entered is not a domain date. The feed used to open each request
 * with `created_at` and `created_by_profile_id`, so it named whoever typed the row
 * in on the day they typed it, while the request's own page and the Activity
 * Monitor named Received by on the request date (#1263). A request date has no
 * time of day, so a receipt sits at the first instant of its day in the
 * Organization's zone and sorts below anything else from that day.
 *
 * **Edits are absent, on purpose.** Nothing in the schema records one. The feed
 * once inferred them from `updated_at`, and that inference could not be made
 * right: `updated_at` holds only the most recent write, so a request edited three
 * times showed one edit; a close writes `closed_at` from the browser and
 * `updated_at` from Postgres, so telling a close from an edit meant a tolerance
 * rather than an equality; and a back-dated close was indistinguishable from an
 * edit made today. A chronology that is right about what it lists is worth more
 * than one that lists a fourth thing it is guessing at. Showing edits needs
 * something that records them; see issue #125.
 *
 * ## Instants, not strings
 *
 * `closed_at` and `commented_at` are `timestamptz`, which the row schema parses
 * into `Date`. The fold used to compare them as text, which worked only because
 * Electric streams one fixed format and `localDayStartAsTimestamp` emitted the
 * same one. A `Date` compared against that text is `"Wed Aug 05 2026…" >=
 * "2026-08-05…"`, which is false for every row in every window: a feed that
 * empties itself and reports no error. So the bound is a `Date` too, and the fold
 * compares instants. The request date is the one plain `YYYY-MM-DD` column, and
 * it is compared as one against the window's first day.
 */

import { toDbEntityType } from '@simmer-mosquito/domain';
import { and, eq, gte, or, useLiveQuery } from '@tanstack/react-db';
import { comments } from '../../lib/collections/comments';
import { localDayStartAsInstant, todayInTimeZone } from '../../lib/local-date';
import { liveQueryGcTimeMs } from './shared';

/**
 * What happened to a service request, as one line in the activity feed.
 *
 * Every kind is read off a column that records it.
 */
export type ServiceRequestEventKind = 'received' | 'commented' | 'closed';

export interface ServiceRequestEvent {
	/** Stable across re-renders: one row can produce several events. */
	readonly key: string;
	readonly kind: ServiceRequestEventKind;
	/**
	 * The instant the event sorts by. For a receipt that is the first instant of
	 * the request date in the Organization's zone, since the date has no time.
	 */
	readonly at: Date;
	/** The day the event belongs to, `YYYY-MM-DD` in the Organization's zone. */
	readonly day: string;
	readonly requestId: string;
	readonly actorProfileId: string | null;
	/** The comment body, for `commented`. Null for every other kind. */
	readonly text: string | null;
}

/** The rows an event feed is folded out of, narrowed to what the fold reads. */
export interface FeedRequest {
	readonly id: string;
	readonly requestDate: string;
	readonly receivedByProfileId: string | null;
	readonly closedAt: Date | null;
	readonly closedByProfileId: string | null;
}

export interface FeedComment {
	readonly id: string;
	readonly entityId: string;
	readonly commentedAt: Date;
	readonly commentText: string;
	readonly commentedByProfileId: string | null;
}

export function useServiceRequestFeed(
	requests: readonly FeedRequest[],
	sinceDate: string,
	timeZone: string,
): {
	readonly events: readonly ServiceRequestEvent[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	// The compiler memoizes the bound so it keeps one identity: a fresh `Date`
	// each render would re-plan the query.
	const since = localDayStartAsInstant(sinceDate, timeZone);

	const result = useLiveQuery({
		gcTime: liveQueryGcTimeMs,
		query: (query) =>
			query
				.from({ comment: comments() })
				// Persisted rows store entity_type in snake_case; an optimistic row that
				// has not synced yet still carries the camelCase domain value. Match both.
				.where(({ comment }) =>
					and(
						or(
							eq(comment.entity_type, 'serviceRequest'),
							eq(comment.entity_type, toDbEntityType('serviceRequest')),
						),
						gte(comment.commented_at, since),
					),
				)
				.orderBy(({ comment }) => comment.commented_at, 'desc')
				.select(({ comment }) => ({
					id: comment.id,
					entityId: comment.entity_id,
					commentedAt: comment.commented_at,
					commentText: comment.comment_text,
					commentedByProfileId: comment.commented_by_profile_id,
				})),
	});

	const rows = result.data;
	const events = deriveServiceRequestEvents(requests, rows, sinceDate, timeZone);

	return { events, isReady: result.isReady, isError: result.isError };
}

/**
 * Fold requests and their comments into one chronology, newest first.
 *
 * Pure and exported for its tests: a window boundary or an unresolvable comment
 * handled the wrong way produces a feed that looks entirely plausible.
 */
export function deriveServiceRequestEvents(
	requests: readonly FeedRequest[],
	commentRows: readonly FeedComment[],
	sinceDate: string,
	timeZone: string,
): readonly ServiceRequestEvent[] {
	const sinceMs = localDayStartAsInstant(sinceDate, timeZone).getTime();
	const requestIds = new Set(requests.map((request) => request.id));
	const events: ServiceRequestEvent[] = [];

	for (const request of requests) {
		const requestDay = request.requestDate.slice(0, 10);
		if (requestDay >= sinceDate) {
			events.push({
				key: `${request.id}:received`,
				kind: 'received',
				at: localDayStartAsInstant(requestDay, timeZone),
				day: requestDay,
				requestId: request.id,
				actorProfileId: request.receivedByProfileId,
				text: null,
			});
		}
		if (request.closedAt !== null && request.closedAt.getTime() >= sinceMs) {
			events.push({
				key: `${request.id}:closed`,
				kind: 'closed',
				at: request.closedAt,
				day: todayInTimeZone(timeZone, request.closedAt),
				requestId: request.id,
				actorProfileId: request.closedByProfileId,
				text: null,
			});
		}
	}

	for (const comment of commentRows) {
		// The comments subset is scoped by entity type, not by request, so a comment
		// whose request is not in the loaded set is dropped rather than rendered
		// against a request the feed cannot name.
		if (!requestIds.has(comment.entityId)) {
			continue;
		}
		events.push({
			key: `${comment.id}:commented`,
			kind: 'commented',
			at: comment.commentedAt,
			day: todayInTimeZone(timeZone, comment.commentedAt),
			requestId: comment.entityId,
			actorProfileId: comment.commentedByProfileId,
			text: comment.commentText,
		});
	}

	return events.sort(newestFirst);
}

/**
 * Newest first, with a receipt below anything else at the same instant. A
 * receipt's instant is the start of its day, so the only thing that can tie it is
 * a close or comment stamped at midnight, and that still happened after the
 * request came in.
 */
function newestFirst(first: ServiceRequestEvent, second: ServiceRequestEvent): number {
	const byInstant = second.at.getTime() - first.at.getTime();
	if (byInstant !== 0) {
		return byInstant;
	}
	return Number(first.kind === 'received') - Number(second.kind === 'received');
}

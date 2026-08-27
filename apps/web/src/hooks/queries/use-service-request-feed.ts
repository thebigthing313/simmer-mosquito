/**
 * The organization's service-request activity over a window, newest first.
 *
 * Each kind comes off a column that means exactly what it says: `created_at`,
 * `closed_at`, and a comment's own `commented_at`.
 *
 * **Edits are absent, on purpose.** Nothing in the schema records one. The feed
 * once inferred them from `updated_at`, and that inference could not be made
 * right: `updated_at` holds only the most recent write, so a request edited three
 * times showed one edit; a close writes `closed_at` from the browser and
 * `updated_at` from Postgres, so telling a close from an edit meant a tolerance
 * rather than an equality; and a back-dated close was indistinguishable from an
 * edit made today. A chronology that is right about what it lists is worth more
 * than one that lists a fourth thing it is guessing at. Showing edits needs
 * something that records them — see issue #125.
 *
 * ## Instants, not strings
 *
 * All three columns are `timestamptz`, which the row schema parses into `Date`.
 * The fold used to compare them as text, which worked only because Electric
 * streams one fixed format and `localDayStartAsTimestamp` emitted the same one.
 * A `Date` compared against that text is `"Wed Aug 05 2026…" >= "2026-08-05…"`,
 * which is false for every row in every window — a feed that empties itself and
 * reports no error. So the bound is a `Date` too, and the fold compares instants.
 */

import { toDbEntityType } from '@simmer-mosquito/domain';
import { and, eq, gte, or, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { comments } from '../../lib/collections/comments';
import { localDayStartAsInstant } from '../../lib/local-date';
import { activityGcTimeMs } from './shared';

/**
 * What happened to a service request, as one line in the activity feed.
 *
 * Every kind is read off a column that records it.
 */
export type ServiceRequestEventKind = 'created' | 'commented' | 'closed';

export interface ServiceRequestEvent {
	/** Stable across re-renders: one row can produce several events. */
	readonly key: string;
	readonly kind: ServiceRequestEventKind;
	/** The instant the event carries. */
	readonly at: Date;
	readonly requestId: string;
	readonly actorProfileId: string | null;
	/** The comment body, for `commented`. Null for every other kind. */
	readonly text: string | null;
}

/** The rows an event feed is folded out of, narrowed to what the fold reads. */
export interface FeedRequest {
	readonly id: string;
	readonly createdAt: Date;
	readonly closedAt: Date | null;
	readonly createdByProfileId: string | null;
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
	// Memoized so the bound keeps one identity: it is both a query dependency and
	// a fold dependency, and a fresh `Date` each render would re-plan the query.
	const since = useMemo(() => localDayStartAsInstant(sinceDate, timeZone), [sinceDate, timeZone]);

	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ comment: comments })
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
		},
		[since],
	);

	const rows = result.data;
	const events = useMemo(
		() => deriveServiceRequestEvents(requests, rows, since),
		[requests, rows, since],
	);

	return { events, isReady: result.isReady, isError: result.isError };
}

/**
 * Fold requests and their comments into one chronology, newest first.
 *
 * Pure and exported for its tests — a window boundary or an unresolvable comment
 * handled the wrong way produces a feed that looks entirely plausible.
 */
export function deriveServiceRequestEvents(
	requests: readonly FeedRequest[],
	commentRows: readonly FeedComment[],
	since: Date,
): readonly ServiceRequestEvent[] {
	const sinceMs = since.getTime();
	const requestIds = new Set(requests.map((request) => request.id));
	const events: ServiceRequestEvent[] = [];

	for (const request of requests) {
		if (request.createdAt.getTime() >= sinceMs) {
			events.push({
				key: `${request.id}:created`,
				kind: 'created',
				at: request.createdAt,
				requestId: request.id,
				actorProfileId: request.createdByProfileId,
				text: null,
			});
		}
		if (request.closedAt !== null && request.closedAt.getTime() >= sinceMs) {
			events.push({
				key: `${request.id}:closed`,
				kind: 'closed',
				at: request.closedAt,
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
			requestId: comment.entityId,
			actorProfileId: comment.commentedByProfileId,
			text: comment.commentText,
		});
	}

	return events.sort((first, second) => second.at.getTime() - first.at.getTime());
}

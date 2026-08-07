import { toDbEntityType } from '@simmer-mosquito/domain';
import type { AddressRow, CommentRow, ContactRow, ServiceRequestRow } from '@simmer-mosquito/sync';
import { and, eq, gte, inArray, or, useLiveQuery } from '@tanstack/react-db';
import { useMemo } from 'react';
import { localDayStartAsTimestamp } from '../../lib/local-date';
import { webCollections } from '../../sync/webCollections';
import { isServiceRequestOpen } from './-public-engagement-display';

// The public-engagement overview reads entirely from synced collections. Both
// service_requests and outreach_actions are on-demand shapes (docs/sync.md), so
// each hook bounds its subset — by organization for requests, by date for
// outreach — and uses the status-gated `useLiveQuery`, not the suspense variant,
// which hangs after a navigation unmount over on-demand collections.

// Pure date helpers are shared with the surveillance overviews; re-exported here
// so every domain builds its windows from one implementation.
export {
	addDaysToDateString,
	formatMonthDay,
	todayInTimeZone,
} from '../larval-surveillance/-overview-data';

/** How far back the recent outreach panel reaches. */
export const OUTREACH_ACTIVITY_WINDOW_DAYS = 14;
/** How far back the service request activity feed reaches. */
export const SERVICE_REQUEST_FEED_WINDOW_DAYS = 7;

const overviewGcTimeMs = 30_000;
/** A sentinel no real row matches, so a query over an empty id set stays inert. */
const UNMATCHABLE_ID = '00000000-0000-0000-0000-000000000000';

interface LoadState {
	readonly isReady: boolean;
	readonly isError: boolean;
}

export interface OrganizationServiceRequests extends LoadState {
	/** Every non-deleted request in the organization, newest request date first. */
	readonly requests: readonly ServiceRequestRow[];
	readonly openRequests: readonly ServiceRequestRow[];
	readonly openCount: number;
}

/**
 * The organization's service requests, newest first, with the open ones split out.
 *
 * One subset serves both panels on this page — the open list and the activity
 * feed — because they ask about the same rows from different angles, and a
 * second org-scoped query over the same table would double the sync for nothing.
 *
 * Open/closed is decided here rather than in the query: `closedAt` is a
 * timestamp, not a flag.
 */
export function useOrganizationServiceRequests(
	organizationId: string,
): OrganizationServiceRequests {
	const result = useLiveQuery(
		{
			gcTime: overviewGcTimeMs,
			query: (query) =>
				query
					.from({ request: webCollections.serviceRequests })
					.where(({ request }) => eq(request.organizationId, organizationId))
					.orderBy(({ request }) => request.requestDate, 'desc'),
		},
		[organizationId],
	);

	const requests = useMemo(
		() => (result.data ?? []) as readonly ServiceRequestRow[],
		[result.data],
	);
	const openRequests = useMemo(
		() => requests.filter((request) => isServiceRequestOpen(request)),
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

export interface RequestParties {
	readonly contactById: ReadonlyMap<string, ContactRow>;
	readonly addressById: ReadonlyMap<string, AddressRow>;
	readonly isReady: boolean;
}

/**
 * The contacts and addresses behind a bounded set of requests.
 *
 * Both collections are on-demand, so this loads exactly the rows the previewed
 * requests point at — one `id = ANY($1)` subset each — rather than a row at a
 * time per list item, which would be one shape request per rendered row.
 */
export function useRequestParties(requests: readonly ServiceRequestRow[]): RequestParties {
	const contactIds = useMemo(
		() => [...new Set(requests.map((request) => request.contactId))].sort(),
		[requests],
	);
	const addressIds = useMemo(
		() => [...new Set(requests.map((request) => request.addressId))].sort(),
		[requests],
	);
	const contactKey = contactIds.join(',');
	const addressKey = addressIds.join(',');
	const contactQueryIds = contactIds.length > 0 ? contactIds : [UNMATCHABLE_ID];
	const addressQueryIds = addressIds.length > 0 ? addressIds : [UNMATCHABLE_ID];

	const contactResult = useLiveQuery(
		{
			gcTime: overviewGcTimeMs,
			query: (query) =>
				query
					.from({ contact: webCollections.contacts })
					.where(({ contact }) => inArray(contact.id, contactQueryIds)),
		},
		[contactKey],
	);
	const addressResult = useLiveQuery(
		{
			gcTime: overviewGcTimeMs,
			query: (query) =>
				query
					.from({ address: webCollections.addresses })
					.where(({ address }) => inArray(address.id, addressQueryIds)),
		},
		[addressKey],
	);

	return useMemo(
		() => ({
			contactById: new Map(
				((contactResult.data ?? []) as readonly ContactRow[]).map(
					(contact) => [contact.id, contact] as const,
				),
			),
			addressById: new Map(
				((addressResult.data ?? []) as readonly AddressRow[]).map(
					(address) => [address.id, address] as const,
				),
			),
			isReady: contactResult.isReady && addressResult.isReady,
		}),
		[contactResult.data, contactResult.isReady, addressResult.data, addressResult.isReady],
	);
}

/**
 * What happened to a service request, as one line in the activity feed.
 *
 * `closed` and `edited` are both writes to the same row, so read the derivation
 * in {@link useServiceRequestFeed} before trusting either.
 */
export type ServiceRequestEventKind = 'created' | 'commented' | 'closed' | 'edited';

export interface ServiceRequestEvent {
	/** Stable across re-renders: one row can produce several events. */
	readonly key: string;
	readonly kind: ServiceRequestEventKind;
	/** The instant the event carries, as Electric streams it. */
	readonly at: string;
	readonly requestId: string;
	readonly actorProfileId: string | null;
	/** The comment body, for `commented`. Null for every other kind. */
	readonly text: string | null;
}

/**
 * The organization's service request activity over a window, newest first.
 *
 * Three of the four kinds come off columns that mean exactly what they say:
 * `createdAt`, `closedAt`, and a comment's own `commentedAt`. **`edited` is
 * inferred**, because nothing records edits — there is no audit table, and
 * `updatedAt` holds only the most recent write. So:
 *
 * - `updatedAt === createdAt` — the insert takes both from the same statement's
 *   default, so they are equal to the character until something writes again.
 *   Nothing has. No edit.
 * - `updatedAt` all but coincides with `closedAt` — the last write was that
 *   close, which is already its own row. No edit. See {@link CLOSE_WRITE_SKEW_MS}
 *   for why this one cannot be an equality.
 * - otherwise — something else wrote to the row, and that is the edit.
 *
 * The standing limit: only the *latest* edit of a request can ever appear.
 * Earlier ones are overwritten in place and are simply not recorded anywhere.
 */
export function useServiceRequestFeed(
	requests: readonly ServiceRequestRow[],
	sinceDate: string,
): { readonly events: readonly ServiceRequestEvent[] } & LoadState {
	// `commentedAt` is a timestamptz; a bare YYYY-MM-DD against one is rejected by
	// Electric outright. See localDayStartAsTimestamp.
	const since = useMemo(() => localDayStartAsTimestamp(sinceDate), [sinceDate]);

	const commentResult = useLiveQuery(
		{
			gcTime: overviewGcTimeMs,
			query: (query) =>
				query
					.from({ comment: webCollections.comments })
					// Persisted rows store entity_type in snake_case; an optimistic row that
					// has not synced yet still carries the camelCase domain value. Match both.
					.where(({ comment }) =>
						and(
							or(
								eq(comment.entityType, 'serviceRequest'),
								eq(comment.entityType, toDbEntityType('serviceRequest')),
							),
							gte(comment.commentedAt, since),
						),
					)
					.orderBy(({ comment }) => comment.commentedAt, 'desc'),
		},
		[since],
	);

	const comments = useMemo(
		() => (commentResult.data ?? []) as readonly CommentRow[],
		[commentResult.data],
	);
	const events = useMemo(
		() => deriveServiceRequestEvents(requests, comments, since),
		[requests, comments, since],
	);

	return {
		events,
		isReady: commentResult.isReady,
		isError: commentResult.isError,
	};
}

/**
 * How far apart `closedAt` and `updatedAt` may sit and still be the same write.
 *
 * They ought to be identical, and are not. Closing a request in this app writes
 * an optimistic `closedAt` from `Date.now()` in the browser, and the command
 * stores exactly that instant; `updated_at` is set by Postgres `now()` when the
 * transaction commits. Two clocks, so two values — usually milliseconds apart,
 * and further on a machine whose clock has drifted.
 *
 * Two minutes is chosen against that skew, not against user behaviour. The cost
 * of it being too wide is a genuine edit made moments after a close going
 * unlisted; the cost of it being too narrow is every close on the feed twice,
 * once as itself and once as a phantom edit. The second is the worse screen.
 */
const CLOSE_WRITE_SKEW_MS = 2 * 60 * 1000;

/**
 * Whether two recorded instants are near enough to be one write.
 *
 * Timestamps arrive in whichever of two shapes their row is in: Electric streams
 * `2026-08-05 13:22:01.481+00`, while a row still carrying an optimistic local
 * write holds an ISO `…T13:22:01.481Z`. Both are normalized before comparison
 * rather than assuming the synced form.
 */
function isSameWrite(left: string, right: string | null): boolean {
	if (right === null) {
		return false;
	}
	const leftMs = toEpochMs(left);
	const rightMs = toEpochMs(right);
	if (Number.isNaN(leftMs) || Number.isNaN(rightMs)) {
		// Unparseable means unknown, and an unknown must not silently swallow an
		// event — fall back to the exact comparison.
		return left === right;
	}
	return Math.abs(leftMs - rightMs) <= CLOSE_WRITE_SKEW_MS;
}

function toEpochMs(value: string): number {
	// `2026-08-05 13:22:01.481+00` → `2026-08-05T13:22:01.481+00:00`. An already
	// ISO value passes through both replacements untouched.
	return Date.parse(value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00'));
}

/** The rows an event feed is folded out of, narrowed to what the fold reads. */
type FeedRequest = Pick<
	ServiceRequestRow,
	'id' | 'createdAt' | 'updatedAt' | 'closedAt' | 'createdByProfileId' | 'updatedByProfileId'
> & { readonly closedByProfileId: string | null };

type FeedComment = Pick<
	CommentRow,
	'id' | 'entityId' | 'commentedAt' | 'commentText' | 'commentedByProfileId'
>;

/**
 * Fold requests and their comments into one chronology, newest first.
 *
 * Pure and exported for its tests — the `edited` rules documented on
 * {@link useServiceRequestFeed} are inference over three timestamps, and getting
 * one of them backwards produces a feed that looks entirely plausible.
 *
 * `since` is compared as a string. Electric streams timestamps in a single
 * fixed format (`2026-08-05 13:22:01.481+00`), and `localDayStartAsTimestamp`
 * emits the same one, so lexical order is chronological order.
 */
export function deriveServiceRequestEvents(
	requests: readonly FeedRequest[],
	comments: readonly FeedComment[],
	since: string,
): readonly ServiceRequestEvent[] {
	const requestIds = new Set(requests.map((request) => request.id));
	const events: ServiceRequestEvent[] = [];

	for (const request of requests) {
		if (request.createdAt >= since) {
			events.push({
				key: `${request.id}:created`,
				kind: 'created',
				at: request.createdAt,
				requestId: request.id,
				actorProfileId: request.createdByProfileId,
				text: null,
			});
		}
		if (request.closedAt !== null && request.closedAt >= since) {
			events.push({
				key: `${request.id}:closed`,
				kind: 'closed',
				at: request.closedAt,
				requestId: request.id,
				actorProfileId: request.closedByProfileId,
				text: null,
			});
		}
		const isCreateWrite = request.updatedAt === request.createdAt;
		const isCloseWrite = isSameWrite(request.updatedAt, request.closedAt);
		if (!(isCreateWrite || isCloseWrite) && request.updatedAt >= since) {
			events.push({
				key: `${request.id}:edited`,
				kind: 'edited',
				at: request.updatedAt,
				requestId: request.id,
				actorProfileId: request.updatedByProfileId,
				text: null,
			});
		}
	}

	for (const comment of comments) {
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

	return events.sort((a, b) => b.at.localeCompare(a.at));
}

export interface RecentOutreachAction {
	readonly id: string;
	readonly outreachMethodId: string;
	readonly technicianProfileId: string | null;
	readonly outreachDate: string;
	readonly reach: number;
	readonly reachDescription: string | null;
}

/** Outreach performed on or after `sinceDate` (a `YYYY-MM-DD`), newest first. */
export function useRecentOutreachActions(sinceDate: string): {
	readonly outreachActions: readonly RecentOutreachAction[];
} & LoadState {
	const result = useLiveQuery(
		{
			gcTime: overviewGcTimeMs,
			query: (query) =>
				query
					.from({ outreach: webCollections.outreachActions })
					.where(({ outreach }) => gte(outreach.outreachDate, sinceDate))
					.orderBy(({ outreach }) => outreach.outreachDate, 'desc')
					.select(({ outreach }) => ({
						id: outreach.id,
						outreachMethodId: outreach.outreachMethodId,
						technicianProfileId: outreach.technicianProfileId,
						outreachDate: outreach.outreachDate,
						reach: outreach.reach,
						reachDescription: outreach.reachDescription,
					})),
		},
		[sinceDate],
	);

	return {
		outreachActions: (result.data ?? []) as unknown as readonly RecentOutreachAction[],
		isReady: result.isReady,
		isError: result.isError,
	};
}

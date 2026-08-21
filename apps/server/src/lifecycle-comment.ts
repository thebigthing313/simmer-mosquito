/**
 * The comment a lifecycle command records alongside the state it changes.
 *
 * Four commands take a caller-supplied comment id and a reason, and the domain
 * docs say each creates a normal unpinned comment in the same transaction:
 * `closeServiceRequest` and `reopenServiceRequest`
 * (`docs/public-engagement-domain.md`), `cancelMission` and `reopenMission`
 * (`docs/mission-dispatch-domain.md`). None of them did. Both fields were
 * validated into the payload and then dropped by the write handler, so an
 * operator's stated reason for closing a request went nowhere and the close left
 * no explanation behind it. See issue #134.
 *
 * One helper rather than four inline inserts, because what has to be right is the
 * same every time and none of it is guessable from the call site:
 *
 * - **`entity_type` crosses a bridge.** The column stores snake_case and the
 *   domain speaks camelCase, so `serviceRequest` must be written
 *   `service_request` or the comment is invisible to every read that filters on
 *   the type. `mission` happens to be identical either way, which is exactly how
 *   a hand-written insert gets this wrong and only one of the two breaks.
 * - **The comment is unpinned.** It records what happened; pinning is for what
 *   someone wants held at the top of a thread.
 * - **Provenance is the operational instant, not the write.** A close back-dated
 *   to last Tuesday is a close that happened last Tuesday, and its comment says
 *   so. When the caller supplied no instant, this falls through to the column
 *   default and the lifecycle column falls through to `now()` in the same
 *   transaction — Postgres `now()` is the transaction timestamp, so the two agree
 *   exactly rather than approximately. That is the difference between this and
 *   the browser-clock `closed_at` that made #125 unanswerable.
 */

import { checkedValues } from '@simmer-mosquito/db';
import { toDbEntityType } from '@simmer-mosquito/domain';
import type { CommandTransaction } from './command-write.js';

/** The records whose lifecycle commands carry a comment. */
export type LifecycleCommentEntity = 'serviceRequest' | 'mission';

export interface LifecycleComment {
	/**
	 * Client-generated, and carried on the command rather than minted here — the
	 * same replay-safety every other created-row id has.
	 */
	readonly commentId: string;
	readonly organizationId: string;
	readonly entityType: LifecycleCommentEntity;
	readonly entityId: string;
	/** The reason the command required: a resolution summary, a cancellation reason. */
	readonly commentText: string;
	/** The operational instant, or null to take the transaction's own clock. */
	readonly commentedAt: Date | null;
	readonly actorProfileId: string;
}

/**
 * Record the comment. Call it after the lifecycle write has returned a row.
 *
 * Order matters: a write handler answering `null` means "not yours or not there"
 * and becomes a 404 — but that happens *after* the transaction commits, so a
 * comment inserted ahead of the check would survive a request that was never
 * closed, attached to a record the caller may not even own.
 */
export async function insertLifecycleComment(
	trx: CommandTransaction,
	comment: LifecycleComment,
): Promise<void> {
	await trx
		.insertInto('comments')
		.values(
			await checkedValues(trx, comment.organizationId, {
				id: comment.commentId,
				organization_id: comment.organizationId,
				entity_type: toDbEntityType(comment.entityType),
				entity_id: comment.entityId,
				comment_text: comment.commentText,
				commented_by_profile_id: comment.actorProfileId,
				// Omitted rather than passed as null: the column is `not null default
				// now()`, so leaving it out is what takes the transaction clock.
				...(comment.commentedAt === null ? {} : { commented_at: comment.commentedAt }),
				is_pinned: false,
				created_by_profile_id: comment.actorProfileId,
				updated_by_profile_id: comment.actorProfileId,
			}),
		)
		.execute();
}

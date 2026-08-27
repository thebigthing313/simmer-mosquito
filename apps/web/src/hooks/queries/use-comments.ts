/**
 * The thread on one record, with its authors' names beside it.
 *
 * One query where the section used two: the comments, and a separate roster read
 * to turn `commented_by_profile_id` into a name. `profiles` is eager, so joining
 * it costs nothing the page was not already paying, and it removes the map
 * lookup the render was doing per comment.
 *
 * `entity_type` is the polymorphic discriminator and the column holds it in
 * snake_case, which is what the server writes and what Electric streams back —
 * see `toDbEntityType`. The write stamps the same spelling on the optimistic
 * row, so unlike the old read there is one value to match rather than two.
 */

import { type CommentTargetType, toDbEntityType } from '@simmer-mosquito/domain';
import { and, caseWhen, coalesce, eq, isNull, useLiveQuery } from '@tanstack/react-db';
import { comments } from '../../lib/collections/comments';
import { profiles } from '../../lib/collections/profiles';

/** The record a thread is attached to. */
export interface CommentTarget {
	readonly type: CommentTargetType;
	readonly id: string;
}

// `comments` is on-demand (ADR 0009 / docs/sync.md); keep the record's subset
// warm briefly after unmount so revisiting it reuses the thread.
const commentsGcTimeMs = 30_000;

/** One comment, in the vocabulary the thread speaks. */
export interface RecordComment {
	readonly id: string;
	readonly commentText: string;
	readonly commentedByProfileId: string | null;
	/**
	 * `null` when the comment names no author, which is not the same as an author
	 * whose Profile has not streamed yet. Guard on `commentedByProfileId`.
	 */
	readonly authorName: string | null;
	readonly commentedAt: Date;
	readonly isPinned: boolean;
}

export interface CommentsResult {
	/** Newest first, which is the order the thread renders in. */
	readonly comments: readonly RecordComment[];
	readonly isReady: boolean;
	readonly isError: boolean;
}

export function useComments(target: CommentTarget): CommentsResult {
	const entityType = toDbEntityType(target.type);

	const result = useLiveQuery(
		{
			gcTime: commentsGcTimeMs,
			query: (query) =>
				query
					.from({ comment: comments })
					.where(({ comment }) =>
						and(eq(comment.entity_type, entityType), eq(comment.entity_id, target.id)),
					)
					// `left`: a comment whose author's Profile has not arrived is still a
					// comment. An `inner` join would drop it from the thread entirely.
					.join(
						{ author: profiles },
						({ comment, author }) => eq(comment.commented_by_profile_id, author.id),
						'left',
					)
					.orderBy(({ comment }) => comment.commented_at, 'desc')
					.select(({ comment, author }) => ({
						id: comment.id,
						commentText: comment.comment_text,
						commentedByProfileId: comment.commented_by_profile_id,
						// Guarded on the comment's own column, so an unattributed comment reads
						// as `null` rather than as the `undefined` an unmatched join yields.
						authorName: caseWhen(
							isNull(comment.commented_by_profile_id),
							null,
							coalesce(author.display_name, 'Unknown'),
						),
						commentedAt: comment.commented_at,
						isPinned: comment.is_pinned,
					})),
		},
		[entityType, target.id],
	);

	return { comments: result.data, isReady: result.isReady, isError: result.isError };
}

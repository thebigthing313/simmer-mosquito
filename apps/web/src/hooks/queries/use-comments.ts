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
import { and, coalesce, eq, useLiveQuery } from '@tanstack/react-db';
import { comments } from '../../lib/collections/comments';
import { profiles } from '../../lib/collections/profiles';
import { activityGcTimeMs } from './shared';

/** The record a thread is attached to. */
export interface CommentTarget {
	readonly type: CommentTargetType;
	readonly id: string;
}

/** One comment, in the vocabulary the thread speaks. */
export interface RecordComment {
	readonly id: string;
	readonly commentText: string;
	readonly commentedByProfileId: string | null;
	/**
	 * `null` when the comment names no author, and also when it names one whose
	 * Profile is not in the client, which is permanent for a deleted Profile. Read
	 * `commentedByProfileId` to tell the two apart.
	 */
	readonly authorName: string | null;
	readonly commentedAt: Date;
	readonly isPinned: boolean;
	/**
	 * When the text was last corrected, and `null` on a comment nobody corrected.
	 * A pin does not set it, which is why this is not `updated_at`.
	 */
	readonly editedAt: Date | null;
	readonly editedByProfileId: string | null;
	/** The corrector's name, read the way {@link RecordComment.authorName} is. */
	readonly editorName: string | null;
}

export interface CommentsResult {
	/** Newest first, which is the order the thread renders in. */
	readonly comments: readonly RecordComment[];
	readonly isReady: boolean;
	readonly isError: boolean;
}

export function useComments(target: CommentTarget): CommentsResult {
	const entityType = toDbEntityType(target.type);

	const result = useLiveQuery({
		gcTime: activityGcTimeMs,
		query: (query) =>
			query
				.from({ comment: comments() })
				.where(({ comment }) =>
					and(eq(comment.entity_type, entityType), eq(comment.entity_id, target.id)),
				)
				// `left`: a comment whose author's Profile has not arrived is still a
				// comment. An `inner` join would drop it from the thread entirely.
				.join(
					{ author: profiles() },
					({ comment, author }) => eq(comment.commented_by_profile_id, author.id),
					'left',
				)
				// The same join again for whoever last corrected the text, `left` for the
				// same reason.
				.join(
					{ editor: profiles() },
					({ comment, editor }) => eq(comment.edited_by_profile_id, editor.id),
					'left',
				)
				.orderBy(({ comment }) => comment.commented_at, 'desc')
				.select(({ comment, author, editor }) => ({
					id: comment.id,
					commentText: comment.comment_text,
					commentedByProfileId: comment.commented_by_profile_id,
					authorName: coalesce(author.display_name, null),
					commentedAt: comment.commented_at,
					isPinned: comment.is_pinned,
					editedAt: comment.edited_at,
					editedByProfileId: comment.edited_by_profile_id,
					editorName: coalesce(editor.display_name, null),
				})),
	});

	return { comments: result.data, isReady: result.isReady, isError: result.isError };
}

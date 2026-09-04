/**
 * Leaving, correcting, pinning and removing a comment.
 *
 * ## Pinning names a command rather than moving a column
 *
 * The old code flipped `is_pinned` on the draft and let the server work out what
 * that meant. Here `pin` and `unpin` are separate commands, which is what the
 * endpoint now requires — and what makes an accidental double-toggle a refusal
 * rather than a silent no-op.
 *
 * The column is still written optimistically, because the chip on screen has to
 * move before the server answers. Naming the command and stamping the column are
 * two different jobs: one tells the server what to do, the other tells the user
 * it happened.
 *
 * ## Correcting text and pinning in one save
 *
 * `edit` and `pin` are separate calls here because the thread offers them as
 * separate controls. If a surface ever did both at once it would name both
 * intents on one write rather than issuing two — TanStack DB merges two updates
 * to the same key and keeps only the last metadata, so the first command's name
 * would be lost. See `mutateCollection`.
 */

import { toDbEntityType } from '@simmer-mosquito/domain';
import { type Comment as CommentRow, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { comments } from '../../lib/collections/comments';
import { mutateCollection } from '../../lib/collections/mutate';
import type { CommentTarget } from '../queries/use-comments';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { newRecordId, optimisticStamp } from './shared';

export interface CommentMutations {
	/** Returns the new comment's id, so a caller can single it out for an entrance. */
	readonly add: (target: CommentTarget, commentText: string) => Promise<string>;
	readonly edit: (commentId: string, commentText: string) => Promise<void>;
	readonly setPinned: (commentId: string, isPinned: boolean) => Promise<void>;
	readonly remove: (commentId: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useCommentMutations(): CommentMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const add = useCallback(
		async (target: CommentTarget, commentText: string) => {
			if (organizationId === null || actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}

			const now = optimisticStamp();
			const commentId = newRecordId();
			await settleWrite(
				mutateCollection(comments(), {
					operation: 'insert',
					intent: 'fieldWork.addComment',
					row: {
						id: commentId,
						organization_id: organizationId,
						entity_type: toDbEntityType(target.type),
						entity_id: target.id,
						comment_text: commentText,
						commented_by_profile_id: actorProfileId,
						// When the note was left rather than when the row was written. They are
						// the same moment here; a comment keyed in after the fact is not
						// something this thread offers.
						commented_at: now,
						is_pinned: false,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies CommentRow,
				}),
			);
			return commentId;
		},
		[organizationId, actorProfileId],
	);

	const edit = useCallback(
		async (commentId: string, commentText: string) => {
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}

			await settleWrite(
				mutateCollection(comments(), {
					operation: 'update',
					intent: 'fieldWork.updateComment',
					key: commentId,
					changes: {
						comment_text: commentText,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const setPinned = useCallback(
		async (commentId: string, isPinned: boolean) => {
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}

			await settleWrite(
				mutateCollection(comments(), {
					operation: 'update',
					// Which way it moved is the command's to say — the endpoint does not read
					// the column to work it out.
					intent: isPinned ? 'fieldWork.pinComment' : 'fieldWork.unpinComment',
					key: commentId,
					changes: {
						is_pinned: isPinned,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(async (commentId: string) => {
		await settleWrite(
			mutateCollection(comments(), {
				operation: 'delete',
				intent: 'fieldWork.deleteComment',
				key: commentId,
			}),
		);
	}, []);

	return {
		add,
		edit,
		setPinned,
		remove,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}

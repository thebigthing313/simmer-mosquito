/**
 * What a create form attaches once the record itself has landed.
 *
 * Two writes, always the same two, always in the same order: the crew rows and
 * the note the form's last box holds. Neither can go in the record's own
 * transaction, because both reference the record by id, so both run after it
 * settles and both are best-effort (see {@link attachLinksBestEffort}).
 *
 * It is one hook rather than two so a create route wires one thing to do one
 * thing. Routes used to hold `useAdditionalPersonnelMutations` and
 * `useCommentMutations` side by side and call them in sequence, which put the
 * order in six places and left each route carrying a hook it used once.
 *
 * ## The comment is not a column
 *
 * A record has no `notes` field. The thread on its detail page is where notes
 * live, so the box writes into that thread rather than adding a second place to
 * look. It is create-only: on an edit the thread is already on screen with its
 * own composer, and a box on the edit form would silently append a new comment
 * every time someone corrected a dip count.
 */

import { useCallback } from 'react';
import { useAdditionalPersonnelMutations } from '../hooks/mutations/use-additional-personnel-mutations';
import { useCommentMutations } from '../hooks/mutations/use-comment-mutations';
import type { AdditionalPersonnelTarget } from '../hooks/queries/use-additional-personnel';
import type { CommentTarget } from '../hooks/queries/use-comments';
import { attachLinksBestEffort } from '../lib/attach-links';

/**
 * The record both writes hang off. One `type` serves both, because a record
 * this form can comment on is a record the crew can be attached to.
 */
export type RecordExtrasTarget = AdditionalPersonnelTarget & CommentTarget;

export interface RecordExtras {
	/**
	 * Crew first, because that is what the record page shows highest. A blank
	 * comment writes nothing.
	 */
	readonly attach: (input: {
		readonly target: RecordExtrasTarget;
		readonly profileIds: readonly string[];
		readonly commentText: string;
	}) => Promise<void>;
	/** The note on its own, for a save that fans out to several records. */
	readonly attachComment: (target: RecordExtrasTarget, commentText: string) => Promise<void>;
}

export function useRecordExtras(): RecordExtras {
	const { setPersonnel } = useAdditionalPersonnelMutations();
	const { add: addComment } = useCommentMutations();

	const attachComment = useCallback(
		async (target: RecordExtrasTarget, commentText: string) => {
			const text = commentText.trim();
			if (text.length === 0) {
				return;
			}
			// The record is already saved, so a failed note cannot fail the save. But
			// the text the user typed is not on the record, so it is reported rather
			// than dropped.
			await attachLinksBestEffort('the note', async () => {
				await addComment(target, text);
			});
		},
		[addComment],
	);

	const attach = useCallback(
		async ({
			target,
			profileIds,
			commentText,
		}: {
			readonly target: RecordExtrasTarget;
			readonly profileIds: readonly string[];
			readonly commentText: string;
		}) => {
			await attachLinksBestEffort('the additional personnel', () =>
				setPersonnel({ target, existing: [], profileIds }),
			);
			await attachComment(target, commentText);
		},
		[setPersonnel, attachComment],
	);

	return { attach, attachComment };
}

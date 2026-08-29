/**
 * The comment a record is created with.
 *
 * Every dated record ends its create form with one free-text box that becomes
 * the first comment on the record's thread. It is not a column: the record has
 * no `notes` field, and the thread on the detail page is where notes live, so
 * the box writes into that thread rather than adding a second place to look.
 *
 * The section is create-only. On an edit, the thread is already on the detail
 * page with its own composer, and a box on the edit form would silently append a
 * new comment every time someone corrected a dip count.
 *
 * The write cannot go in the record's transaction: a comment references the
 * record by id, so the record has to land first. That makes it the same
 * best-effort chain as the crew rows in {@link attachLinksBestEffort}.
 */

import type { CommentTargetType } from '@simmer-mosquito/domain';
import { attachLinksBestEffort } from '../lib/attach-links';

/** Section heading. Plural because the record's thread is what it opens. */
export const firstCommentTitle = 'Comments';

export const firstCommentLabel = 'Comment';

export const firstCommentDescription = 'Saved as the first comment on this record.';

export const firstCommentPlaceholder = 'Add a note for this record…';

/**
 * Write the create form's note as the record's first comment, once the record
 * itself has settled. A blank box writes nothing.
 */
export async function attachFirstComment(
	add: (
		target: { readonly type: CommentTargetType; readonly id: string },
		text: string,
	) => Promise<string>,
	target: { readonly type: CommentTargetType; readonly id: string },
	commentText: string,
): Promise<void> {
	const text = commentText.trim();
	if (text.length === 0) {
		return;
	}
	// The record is already saved, so a failed note cannot fail the save — but
	// the text the user typed is not on the record, so it is reported rather
	// than dropped.
	await attachLinksBestEffort('the note', async () => {
		await add(target, text);
	});
}

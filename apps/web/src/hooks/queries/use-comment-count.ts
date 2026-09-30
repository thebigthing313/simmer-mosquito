/**
 * How many comments a record has, for a label drawn before its thread is open.
 *
 * A tab strip shows the count while the thread's tab is closed, so the count
 * cannot come from inside the thread. It reads the thread's own query rather
 * than a narrower one, so the label and the list it opens cannot disagree.
 * Zero while the read is loading, which a label draws as no count at all.
 */

import { type CommentTarget, useComments } from './use-comments';

export function useCommentCount(target: CommentTarget): number {
	return useComments(target).comments.length;
}

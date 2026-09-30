import { useCommentCount } from '../hooks/queries/use-comment-count';
import type { CommentTarget } from '../hooks/queries/use-comments';
import { LabelCount } from './label-count';

/**
 * A record's comment count, for a Comments tab label. Takes the record the
 * thread hangs off and draws nothing while it has no comments.
 */
export function CommentCount({ target }: { readonly target: CommentTarget }) {
	return <LabelCount count={useCommentCount(target)} />;
}

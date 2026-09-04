/**
 * The `comments` table, as commands.
 *
 * A thread on any record — the second polymorphic `fieldWork.*` table, after
 * `additional_personnel`. Five commands: add, correct the text, pin, unpin,
 * delete.
 *
 * ## Pinning is two commands, not a column
 *
 * The old PATCH read `isPinned` and chose `pinComment` or `unpinComment` from
 * which way the boolean pointed. That is the inference this surface exists to
 * remove, and pinning is the clearest case for it: `is_pinned` is a column a
 * client can watch change, but which way it moved is the command's to say. So
 * both names are here and the column is never read to decide between them.
 *
 * It also means one save can be both — correcting a comment's text and pinning
 * it names `updateComment` and `pinComment` over one payload, which is what
 * `intents` being a list is for. `updateComment` reads `comment_text` and the
 * other two read nothing, so neither can take the other's field by mistake.
 *
 * ## Field names
 *
 * Postgres column names: `comment_text`, `commented_at`, `entity_type`,
 * `entity_id`. `is_pinned` is deliberately absent — see above. `commented_at` is
 * when the note was left rather than when the row was written, so a comment
 * keyed in after the fact can carry its own time; absent means now.
 */

import {
	addCommentCommand,
	deleteCommentCommand,
	type FieldWorkCommand,
	pinCommentCommand,
	unpinCommentCommand,
	updateCommentCommand,
} from '@simmer-mosquito/domain';
import { readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { writeCommentCommand } from '../field-work-commands/comments.js';
import { type CommentRow, readDate } from '../field-work-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { readEntityTarget } from './shared.js';

export function commentTableCommands(
	db: CommandDb,
): TableCommands<'comments', FieldWorkCommand, CommentRow> {
	return {
		table: 'comments',
		run: {
			db,
			write: writeCommentCommand,
			notFound: 'comment_not_found',
			key: 'comment',
		},
		intents: {
			'fieldWork.addComment': ({ payload, agency, id }) =>
				addCommentCommand({
					...agency,
					commentId: id,
					target: readEntityTarget(payload.entity_type, payload.entity_id),
					commentText: readText(payload.comment_text) ?? '',
					commentedAt: readDate(payload.commented_at),
				}),

			'fieldWork.updateComment': ({ payload, agency, id }) =>
				updateCommentCommand({
					...agency,
					commentId: id,
					commentText: readText(payload.comment_text) ?? '',
				}),

			'fieldWork.pinComment': ({ agency, id }) => pinCommentCommand({ ...agency, commentId: id }),

			'fieldWork.unpinComment': ({ agency, id }) =>
				unpinCommentCommand({ ...agency, commentId: id }),

			// No acknowledgement: nothing hangs off a comment, so removing one takes
			// nothing with it.
			'fieldWork.deleteComment': ({ agency, id }) =>
				deleteCommentCommand({ ...agency, commentId: id }),
		},
	};
}

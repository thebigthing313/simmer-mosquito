/**
 * The `tag_items` table, as commands.
 *
 * Which Tags are on which records. A link row carries nothing of its own — a Tag
 * is either on a record or it is not — so there are two commands and no update,
 * the same shape as `additional_personnel` and `application_batches`.
 *
 * The Tag *catalog* is a different table and a different surface: `fieldWork.createTag`
 * and its four siblings are still served by `foundation-commands/tags.ts`, and
 * the only client that writes them is the my-organization page, which has not
 * moved to sync collections yet. Assigning a Tag and defining one are not the
 * same permission or the same screen.
 *
 * ## Field names
 *
 * Postgres column names: `tag_id`, `entity_type`, `entity_id`. The target types
 * a Tag accepts are narrower than a comment's, which is one reason
 * `readEntityTarget` leaves the check to the domain rather than doing it itself.
 */

import {
	assignTagCommand,
	type FieldWorkCommand,
	unassignTagCommand,
} from '@simmer-mosquito/domain';
import { readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import type { TagItemRow } from '../field-work-commands/shared.js';
import { writeTagItemCommand } from '../field-work-commands/tag-items.js';
import type { TableCommands } from './dispatch.js';
import { readEntityTarget } from './shared.js';

export function tagItemTableCommands(
	db: CommandDb,
): TableCommands<'tag_items', FieldWorkCommand, TagItemRow> {
	return {
		table: 'tag_items',
		run: {
			db,
			write: writeTagItemCommand,
			notFound: 'tag_item_not_found',
			key: 'tagItem',
		},
		intents: {
			'fieldWork.assignTag': ({ payload, agency, id }) =>
				assignTagCommand({
					...agency,
					tagItemId: id,
					tagId: readText(payload.tag_id) ?? '',
					target: readEntityTarget(payload.entity_type, payload.entity_id),
				}),

			// Only the link row's id: which record the Tag was on is what the server
			// looks up, and it is also how the ownership check reaches it.
			'fieldWork.unassignTag': ({ agency, id }) => unassignTagCommand({ ...agency, tagItemId: id }),
		},
	};
}

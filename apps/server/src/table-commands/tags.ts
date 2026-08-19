/**
 * The `tags` table, as commands.
 *
 * The label vocabulary an agency defines, and the ninth catalog with the same
 * five commands as the other eight — create, update, retire, restore, delete.
 * `tag_items.ts` is the other half and a different surface entirely: assigning a
 * Tag to a record and defining one are not the same permission or the same
 * screen.
 *
 * ## What the old routes inferred
 *
 * `foundation-commands/tags.ts` builds its commands from what arrived in a
 * PATCH: a `tagName`, `description` or `color` means `updateTag`, and an
 * `isActive` means `activateTag` *or* `deactivateTag` depending on which way the
 * boolean points. `is_active` is a column a client can watch change, but which
 * way it moved is the command's to say — so both directions are named here and
 * the column is never read.
 *
 * That inference had a second cost on the create side. The POST body carried no
 * `isActive` at all, so a Tag created with the switch off was written active and
 * the switch flicked back on when the write synced. Here the client names
 * `deactivateTag` beside `createTag` and both commit in the one transaction.
 *
 * ## Field names
 *
 * Postgres column names: `tag_name`, `description`, `color`. No geometry and no
 * lifecycle instruction, so no camelCase exception.
 */

import type { SafeTag } from '@simmer-mosquito/db';
import {
	activateTagCommand,
	createTagCommand,
	deactivateTagCommand,
	deleteTagCommand,
	updateTagCommand,
} from '@simmer-mosquito/domain';
import { readNullableText, readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import type { TagCommand } from '../foundation-commands/shared.js';
import { writeFoundationTagCommand } from '../foundation-commands/tags.js';
import type { TableCommands } from './dispatch.js';

export function tagTableCommands(db: CommandDb): TableCommands<TagCommand, SafeTag> {
	return {
		table: 'tags',
		run: { db, write: writeFoundationTagCommand, notFound: 'tag_not_found', key: 'tag' },
		intents: {
			'fieldWork.createTag': ({ payload, agency, id }) =>
				createTagCommand({
					...agency,
					tagId: id,
					tagName: readText(payload.tag_name) ?? '',
					description: readNullableText(payload.description),
					color: readNullableText(payload.color),
				}),

			// Each field is read only when it arrived: the domain refuses an update
			// with nothing to change, and a save that renamed a Tag without touching
			// its colour must not claim to have cleared one.
			'fieldWork.updateTag': ({ payload, agency, id }) =>
				updateTagCommand({
					...agency,
					tagId: id,
					...('tag_name' in payload ? { tagName: readText(payload.tag_name) ?? '' } : {}),
					...('description' in payload
						? { description: readNullableText(payload.description) }
						: {}),
					...('color' in payload ? { color: readNullableText(payload.color) } : {}),
				}),

			'fieldWork.activateTag': ({ agency, id }) => activateTagCommand({ ...agency, tagId: id }),

			'fieldWork.deactivateTag': ({ agency, id }) => deactivateTagCommand({ ...agency, tagId: id }),

			'fieldWork.deleteTag': ({ agency, id }) => deleteTagCommand({ ...agency, tagId: id }),
		},
	};
}

/**
 * The `tags` table, as commands.
 *
 * The label vocabulary an organization defines, and the ninth catalog with the
 * same five commands as the other eight — create, update, retire, restore,
 * delete. `tag_items.ts` is the other half and a different surface entirely:
 * assigning a Tag to a record and defining one are not the same permission or
 * the same screen.
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
 * Postgres column names: `tag_name`, `description`, `color`,
 * `relevant_entity_types`. No geometry and no lifecycle instruction, so no
 * camelCase exception.
 */

import type { TagRow } from '@simmer-mosquito/db';
import {
	activateTagCommand,
	createTagCommand,
	deactivateTagCommand,
	deleteTagCommand,
	updateTagCommand,
} from '@simmer-mosquito/domain';
import { readNullableText, readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import type { TagCommand } from '../writers/foundation/shared.js';
import { writeFoundationTagCommand } from '../writers/foundation/tags.js';
import type { TableCommands } from './dispatch.js';

/**
 * The record types a Tag is meant for, as they arrived.
 *
 * A malformed entry is kept as an empty string rather than filtered out, the way
 * `readIdList` keeps one: dropping it would store a set shorter than the one
 * that was sent, under a 200. The domain refuses an entry that is not one of the
 * six taggable targets, so an empty string is what makes it say so.
 */
function readRelevantEntityTypes(value: unknown): readonly string[] {
	return Array.isArray(value) ? value.map((entry) => (typeof entry === 'string' ? entry : '')) : [];
}

export function tagTableCommands(db: CommandDb): TableCommands<'tags', TagCommand, TagRow> {
	return {
		table: 'tags',
		run: { db, write: writeFoundationTagCommand, notFound: 'tag_not_found', key: 'tag' },
		intents: {
			'fieldWork.createTag': ({ payload, organization, id }) =>
				createTagCommand({
					...organization,
					tagId: id,
					tagName: readText(payload.tag_name) ?? '',
					description: readNullableText(payload.description),
					color: readNullableText(payload.color),
				}),

			// Each field is read only when it arrived: the domain refuses an update
			// with nothing to change, and a save that renamed a Tag without touching
			// its colour must not claim to have cleared one.
			'fieldWork.updateTag': ({ payload, organization, id }) =>
				updateTagCommand({
					...organization,
					tagId: id,
					...(payload.tag_name !== undefined ? { tagName: readText(payload.tag_name) ?? '' } : {}),
					...(payload.description !== undefined
						? { description: readNullableText(payload.description) }
						: {}),
					...(payload.color !== undefined ? { color: readNullableText(payload.color) } : {}),
					...(payload.relevant_entity_types !== undefined
						? { relevantEntityTypes: readRelevantEntityTypes(payload.relevant_entity_types) }
						: {}),
				}),

			'fieldWork.activateTag': ({ organization, id }) =>
				activateTagCommand({ ...organization, tagId: id }),

			'fieldWork.deactivateTag': ({ organization, id }) =>
				deactivateTagCommand({ ...organization, tagId: id }),

			'fieldWork.deleteTag': ({ organization, id }) =>
				deleteTagCommand({ ...organization, tagId: id }),
		},
	};
}

/**
 * The `additional_personnel` table, as commands.
 *
 * The crew who worked a record alongside the person it is attributed to. One
 * polymorphic table backs every kind of field work, which is why this is the
 * first `fieldWork.*` map: six record types write it, and until it existed none
 * of them could attach a crew through a sync collection.
 *
 * Two commands, and only two. A link row carries nothing of its own — a Profile
 * either worked the record or did not — so there is no update, and a form that
 * changes the crew is an add and a remove rather than an edit.
 *
 * ## Field names
 *
 * Postgres column names: `personnel_profile_id`, `entity_type`, `entity_id`.
 *
 * `entity_type` is the polymorphic discriminator, and the column holds it in
 * snake_case (`source_reduction`) while the domain's target vocabulary is
 * camelCase (`sourceReduction`). A client writing this table through a sync
 * collection sends the column's spelling, so it is turned back with
 * `fromDbEntityType`; the domain then refuses anything that is not a target type
 * it accepts, naming it. A caller that sends the camelCase form is honoured too,
 * because converting one that has no underscores changes nothing.
 */

import {
	addAdditionalPersonnelCommand,
	type FieldWorkCommand,
	fromDbEntityType,
	removeAdditionalPersonnelCommand,
} from '@simmer-mosquito/domain';
import { readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { writeAdditionalPersonnelCommand } from '../field-work-commands/additional-personnel.js';
import type { SafeAdditionalPersonnel } from '../field-work-commands/shared.js';
import type { TableCommands } from './dispatch.js';

/**
 * The record a crew row hangs off, out of the two columns that hold it.
 *
 * The type is cast rather than narrowed, as `readTarget` does on the legacy
 * routes: this is untrusted text, and which target types the command accepts is
 * the domain's to say. `validateTarget` checks it against
 * `ADDITIONAL_PERSONNEL_TARGET_TYPES` and names it when it is wrong, so
 * narrowing here would be a second copy of that list — and the copy that goes
 * stale.
 */
function readPersonnelTarget(payload: Record<string, unknown>): {
	readonly type: never;
	readonly id: string;
} {
	return {
		type: fromDbEntityType(readText(payload.entity_type) ?? '') as never,
		id: readText(payload.entity_id) ?? '',
	};
}

export function additionalPersonnelTableCommands(
	db: CommandDb,
): TableCommands<FieldWorkCommand, SafeAdditionalPersonnel> {
	return {
		table: 'additional_personnel',
		run: {
			db,
			write: writeAdditionalPersonnelCommand,
			notFound: 'additional_personnel_not_found',
			key: 'additionalPersonnel',
		},
		intents: {
			'fieldWork.addAdditionalPersonnel': ({ payload, agency, id }) =>
				addAdditionalPersonnelCommand({
					...agency,
					additionalPersonnelId: id,
					target: readPersonnelTarget(payload),
					personnelProfileId: readText(payload.personnel_profile_id) ?? '',
				}),

			// Only the link row's id: which record the Profile worked is what the
			// server looks up, and it is also how the ownership check reaches it.
			'fieldWork.removeAdditionalPersonnel': ({ agency, id }) =>
				removeAdditionalPersonnelCommand({ ...agency, additionalPersonnelId: id }),
		},
	};
}

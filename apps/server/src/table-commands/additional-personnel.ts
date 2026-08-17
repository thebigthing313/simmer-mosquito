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
 * `entity_type` is the polymorphic discriminator — see `readEntityTarget` in
 * `shared.ts` for why the column's spelling is not the domain's.
 */

import {
	addAdditionalPersonnelCommand,
	type FieldWorkCommand,
	removeAdditionalPersonnelCommand,
} from '@simmer-mosquito/domain';
import { readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { writeAdditionalPersonnelCommand } from '../field-work-commands/additional-personnel.js';
import type { SafeAdditionalPersonnel } from '../field-work-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { readEntityTarget } from './shared.js';

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
					target: readEntityTarget(payload),
					personnelProfileId: readText(payload.personnel_profile_id) ?? '',
				}),

			// Only the link row's id: which record the Profile worked is what the
			// server looks up, and it is also how the ownership check reaches it.
			'fieldWork.removeAdditionalPersonnel': ({ agency, id }) =>
				removeAdditionalPersonnelCommand({ ...agency, additionalPersonnelId: id }),
		},
	};
}

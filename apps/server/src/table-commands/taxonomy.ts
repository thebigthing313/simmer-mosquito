/**
 * The `genera` and `species` tables, as commands — the first operator tables.
 *
 * These are the global mosquito taxonomy. No `organization_id`, and every
 * agency reads them, so an edit here is SIMMER's to make and nobody else's.
 * They reach `/commands/{table}` through the operator door rather than the
 * agency one, because the commands they carry are not agency commands: the
 * domain types them on `OperatorFoundationCommandInput`, which is
 * `{ operatorUserId }` and nothing else. See `OperatorTableCommands` in
 * `dispatch.ts`, and the `operator` arm of `CommandPermission`.
 *
 * ## The writers are new, and deliberately not the `*WithTxid` helpers
 *
 * These six commands were among the twenty with no writer at all (#163);
 * `/admin/genera` and `/admin/species` called `createGenusWithTxid` and its
 * siblings directly, with no command, no permission map and no actor. Those six
 * routes are gone and the helpers with them — this is the only door now.
 *
 * The update helpers could not have been reused as they stood, and the reason is
 * worth recording: `updateGenus` and `updateSpecies` `.set()` every column
 * unconditionally, so they were whole-row replacements wearing an update's name.
 * `updateSpecies` in particular wrote `genus_id: input.genusId ?? null` — a
 * partial edit that changed only an epithet would silently orphan the species
 * from its genus. A command carries `changes`, so these set what changed.
 *
 * ## Field names
 *
 * Postgres column names: `abbreviation`, `name`, `genus_id`, `epithet`,
 * `common_name`, `display_name`.
 */

import { assertHistoryAcknowledged, type SelectedRow, sql } from '@simmer-mosquito/db';
import {
	createGenusCommand,
	createSpeciesCommand,
	deleteGenusCommand,
	deleteSpeciesCommand,
	type FoundationCommand,
	updateGenusCommand,
	updateSpeciesCommand,
} from '@simmer-mosquito/domain';
import { readNullableText, readText } from '../command-payload.js';
import type { CommandDb, CommandTransaction } from '../command-write.js';
import { genusSpeciesRule, speciesRecordRules } from '../record-history.js';
import type { OperatorTableCommands } from './dispatch.js';
import { acknowledged, refusableWrite } from './shared.js';

const GENUS_COLUMNS = ['id', 'abbreviation', 'name', 'created_at', 'updated_at'] as const;
const SPECIES_COLUMNS = [
	'id',
	'genus_id',
	'epithet',
	'common_name',
	'display_name',
	'created_at',
	'updated_at',
] as const;

type GenusRow = SelectedRow<'genera', typeof GENUS_COLUMNS>;

type SpeciesRow = SelectedRow<'species', typeof SPECIES_COLUMNS>;

async function writeGenusCommand(
	trx: CommandTransaction,
	command: FoundationCommand,
): Promise<GenusRow | null> {
	switch (command.type) {
		case 'foundation.createGenus': {
			const row = await trx
				.insertInto('genera')
				.values({
					id: command.payload.genusId,
					abbreviation: command.payload.abbreviation,
					name: command.payload.name,
				})
				.returning(GENUS_COLUMNS)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'foundation.updateGenus': {
			const changes = command.payload.changes;
			// Every agency's species sit under this genus, and each of them is read
			// back as "<genus> <epithet>", so the abbreviation and the name are both
			// what a renamed genus rewrites. The count is global and says so: the
			// caller is an operator, who already reads every agency, and a
			// per-agency breakdown would be a report somebody would then want sorted.
			await assertHistoryAcknowledged(trx, {
				acknowledgement: 'acknowledgedTaxonomyLabelChange',
				acknowledged: command.payload.acknowledgedTaxonomyLabelChange,
				subject: 'genus',
				rules: [genusSpeciesRule(command.payload.genusId)],
				message: 'Renaming this genus renames it for every agency that reads the taxonomy.',
			});
			const row = await trx
				.updateTable('genera')
				.set({
					...('abbreviation' in changes ? { abbreviation: changes.abbreviation } : {}),
					...('name' in changes ? { name: changes.name } : {}),
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.genusId)
				.returning(GENUS_COLUMNS)
				.executeTakeFirst();
			return row ?? null;
		}
		// A hard delete, unlike every agency table: the taxonomy has no
		// `deleted_at`, and the foreign keys refuse a genus that still has species.
		case 'foundation.deleteGenus': {
			const row = await refusableWrite(
				() =>
					trx
						.deleteFrom('genera')
						.where('id', '=', command.payload.genusId)
						.returning(GENUS_COLUMNS)
						.executeTakeFirst(),
				{
					inUse: {
						error: 'genus_in_use',
						reason: 'This genus still has species recorded against it.',
					},
				},
			);
			return row ?? null;
		}
		default:
			throw new Error(`Unsupported genus command: ${command.type}`);
	}
}

async function writeSpeciesCommand(
	trx: CommandTransaction,
	command: FoundationCommand,
): Promise<SpeciesRow | null> {
	switch (command.type) {
		case 'foundation.createSpecies': {
			const row = await trx
				.insertInto('species')
				.values({
					id: command.payload.speciesId,
					genus_id: command.payload.genusId,
					epithet: command.payload.epithet,
					common_name: command.payload.commonName,
					display_name: command.payload.displayName,
				})
				.returning(SPECIES_COLUMNS)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'foundation.updateSpecies': {
			const changes = command.payload.changes;
			// Every field this command changes is part of what an identification
			// claims: the genus it sits under, the epithet, the common name and the
			// display name. So the whole change set opens the question, and the
			// count is every agency's counts and species lists at once.
			await assertHistoryAcknowledged(trx, {
				acknowledgement: 'acknowledgedTaxonomyMeaningChange',
				acknowledged: command.payload.acknowledgedTaxonomyMeaningChange,
				subject: 'species',
				rules: speciesRecordRules(command.payload.speciesId),
				message:
					'Renaming this species rewrites what every identification recorded under it claims, for every agency.',
			});
			const row = await trx
				.updateTable('species')
				.set({
					// Presence, not `?? null`: the helper this replaces would have
					// detached a species from its genus on any edit that did not restate
					// it.
					...('genusId' in changes ? { genus_id: changes.genusId ?? null } : {}),
					...('epithet' in changes ? { epithet: changes.epithet } : {}),
					...('commonName' in changes ? { common_name: changes.commonName ?? null } : {}),
					...('displayName' in changes ? { display_name: changes.displayName } : {}),
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.speciesId)
				.returning(SPECIES_COLUMNS)
				.executeTakeFirst();
			return row ?? null;
		}
		case 'foundation.deleteSpecies': {
			const row = await refusableWrite(
				() =>
					trx
						.deleteFrom('species')
						.where('id', '=', command.payload.speciesId)
						.returning(SPECIES_COLUMNS)
						.executeTakeFirst(),
				{
					inUse: {
						error: 'species_in_use',
						reason:
							'This species is still enabled for an agency, or recorded in a count. Remove those first.',
					},
				},
			);
			return row ?? null;
		}
		default:
			throw new Error(`Unsupported species command: ${command.type}`);
	}
}

export function genusTableCommands(
	db: CommandDb,
): OperatorTableCommands<'genera', FoundationCommand, GenusRow> {
	return {
		table: 'genera',
		actor: 'operator',
		run: { db, write: writeGenusCommand, notFound: 'genus_not_found', key: 'genus' },
		intents: {
			'foundation.createGenus': ({ payload, operatorUserId, id }) =>
				createGenusCommand({
					operatorUserId,
					genusId: id,
					abbreviation: readText(payload.abbreviation) ?? '',
					name: readText(payload.name) ?? '',
				}),

			'foundation.updateGenus': ({ payload, operatorUserId, id }) =>
				updateGenusCommand({
					operatorUserId,
					genusId: id,
					acknowledgedTaxonomyLabelChange: acknowledged(payload, 'acknowledgedTaxonomyLabelChange'),
					...(payload.abbreviation !== undefined
						? { abbreviation: readText(payload.abbreviation) ?? '' }
						: {}),
					...(payload.name !== undefined ? { name: readText(payload.name) ?? '' } : {}),
				}),

			'foundation.deleteGenus': ({ operatorUserId, id }) =>
				deleteGenusCommand({ operatorUserId, genusId: id }),
		},
	};
}

export function speciesTableCommands(
	db: CommandDb,
): OperatorTableCommands<'species', FoundationCommand, SpeciesRow> {
	return {
		table: 'species',
		actor: 'operator',
		run: { db, write: writeSpeciesCommand, notFound: 'species_not_found', key: 'species' },
		intents: {
			'foundation.createSpecies': ({ payload, operatorUserId, id }) =>
				createSpeciesCommand({
					operatorUserId,
					speciesId: id,
					genusId: readNullableText(payload.genus_id),
					epithet: readText(payload.epithet) ?? '',
					commonName: readNullableText(payload.common_name),
					displayName: readText(payload.display_name) ?? '',
				}),

			'foundation.updateSpecies': ({ payload, operatorUserId, id }) =>
				updateSpeciesCommand({
					operatorUserId,
					speciesId: id,
					...(payload.genus_id !== undefined
						? { genusId: readNullableText(payload.genus_id) }
						: {}),
					...(payload.epithet !== undefined ? { epithet: readText(payload.epithet) ?? '' } : {}),
					...(payload.common_name !== undefined
						? { commonName: readNullableText(payload.common_name) }
						: {}),
					...(payload.display_name !== undefined
						? { displayName: readText(payload.display_name) ?? '' }
						: {}),
					// Nothing guards on this yet, but it is recorded on the command, and
					// recording `false` on every edit an operator did confirm would make
					// the audit trail say the opposite of what happened.
					acknowledgedTaxonomyMeaningChange: acknowledged(
						payload,
						'acknowledgedTaxonomyMeaningChange',
					),
				}),

			'foundation.deleteSpecies': ({ operatorUserId, id }) =>
				deleteSpeciesCommand({ operatorUserId, speciesId: id }),
		},
	};
}

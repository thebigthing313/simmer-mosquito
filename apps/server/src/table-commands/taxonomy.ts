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

import { type SelectedRow, sql } from '@simmer-mosquito/db';
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
): OperatorTableCommands<FoundationCommand, GenusRow> {
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
					...('abbreviation' in payload
						? { abbreviation: readText(payload.abbreviation) ?? '' }
						: {}),
					...('name' in payload ? { name: readText(payload.name) ?? '' } : {}),
				}),

			'foundation.deleteGenus': ({ operatorUserId, id }) =>
				deleteGenusCommand({ operatorUserId, genusId: id }),
		},
	};
}

export function speciesTableCommands(
	db: CommandDb,
): OperatorTableCommands<FoundationCommand, SpeciesRow> {
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
					...('genus_id' in payload ? { genusId: readNullableText(payload.genus_id) } : {}),
					...('epithet' in payload ? { epithet: readText(payload.epithet) ?? '' } : {}),
					...('common_name' in payload
						? { commonName: readNullableText(payload.common_name) }
						: {}),
					...('display_name' in payload
						? { displayName: readText(payload.display_name) ?? '' }
						: {}),
					// Nothing guards on this yet, but it is recorded on the command, and
					// recording `false` on every edit an operator did confirm would make
					// the audit trail say the opposite of what happened.
					acknowledgedTaxonomyMeaningChange: acknowledged(
						payload.acknowledgedTaxonomyMeaningChange,
					),
				}),

			'foundation.deleteSpecies': ({ operatorUserId, id }) =>
				deleteSpeciesCommand({ operatorUserId, speciesId: id }),
		},
	};
}

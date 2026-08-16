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

import { sql } from '@simmer-mosquito/db';
import {
	createGenusCommand,
	createSpeciesCommand,
	deleteGenusCommand,
	deleteSpeciesCommand,
	type FoundationCommand,
	updateGenusCommand,
	updateSpeciesCommand,
} from '@simmer-mosquito/domain';
import { CommandError } from '../command-endpoint.js';
import { readNullableText, readText } from '../command-payload.js';
import type { CommandDb, CommandTransaction } from '../command-write.js';
import type { OperatorTableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

/** Postgres refusing to orphan a row: `foreign_key_violation`. */
const FOREIGN_KEY_VIOLATION = '23503';

/**
 * The delete Postgres refuses, said in words.
 *
 * The console explains the rule — a genus with species, a species an agency has
 * enabled — before it asks for confirmation, so the refusal it gets back has to
 * be the same rule and not a stack trace. Every other table on this surface is
 * soft-deleted and decides this before writing, in `applyRecordDeletion`; the
 * taxonomy has no `deleted_at` and leans on the foreign keys instead, so the
 * answer only exists once the statement has run.
 *
 * Only `23503` is translated. Anything else rethrows, because a delete that
 * failed for some other reason is not a rule being enforced, and reporting a
 * dropped connection as "still in use" would send an operator looking for
 * records that are not there.
 */
async function refusableDelete<TRow>(
	run: () => Promise<TRow>,
	refusal: { readonly error: string; readonly reason: string },
): Promise<TRow> {
	try {
		return await run();
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'code' in error &&
			(error as { readonly code: unknown }).code === FOREIGN_KEY_VIOLATION
		) {
			throw new CommandError(409, refusal);
		}

		throw error;
	}
}

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

interface SafeGenusRow {
	readonly id: string;
	readonly abbreviation: string;
	readonly name: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

interface SafeSpeciesRow {
	readonly id: string;
	readonly genusId: string | null;
	readonly epithet: string;
	readonly commonName: string | null;
	readonly displayName: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toGenus(row: {
	readonly id: string;
	readonly abbreviation: string;
	readonly name: string;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeGenusRow {
	return {
		id: row.id,
		abbreviation: row.abbreviation,
		name: row.name,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toSpecies(row: {
	readonly id: string;
	readonly genus_id: string | null;
	readonly epithet: string;
	readonly common_name: string | null;
	readonly display_name: string;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeSpeciesRow {
	return {
		id: row.id,
		genusId: row.genus_id,
		epithet: row.epithet,
		commonName: row.common_name,
		displayName: row.display_name,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

async function writeGenusCommand(
	trx: CommandTransaction,
	command: FoundationCommand,
): Promise<SafeGenusRow | null> {
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
			return toGenus(row);
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
			return row === undefined ? null : toGenus(row);
		}
		// A hard delete, unlike every agency table: the taxonomy has no
		// `deleted_at`, and the foreign keys refuse a genus that still has species.
		case 'foundation.deleteGenus': {
			const row = await refusableDelete(
				() =>
					trx
						.deleteFrom('genera')
						.where('id', '=', command.payload.genusId)
						.returning(GENUS_COLUMNS)
						.executeTakeFirst(),
				{
					error: 'genus_in_use',
					reason: 'This genus still has species recorded against it.',
				},
			);
			return row === undefined ? null : toGenus(row);
		}
		default:
			throw new Error(`Unsupported genus command: ${command.type}`);
	}
}

async function writeSpeciesCommand(
	trx: CommandTransaction,
	command: FoundationCommand,
): Promise<SafeSpeciesRow | null> {
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
			return toSpecies(row);
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
			return row === undefined ? null : toSpecies(row);
		}
		case 'foundation.deleteSpecies': {
			const row = await refusableDelete(
				() =>
					trx
						.deleteFrom('species')
						.where('id', '=', command.payload.speciesId)
						.returning(SPECIES_COLUMNS)
						.executeTakeFirst(),
				{
					error: 'species_in_use',
					reason:
						'This species is still enabled for an agency, or recorded in a count. Remove those first.',
				},
			);
			return row === undefined ? null : toSpecies(row);
		}
		default:
			throw new Error(`Unsupported species command: ${command.type}`);
	}
}

export function genusTableCommands(
	db: CommandDb,
): OperatorTableCommands<FoundationCommand, SafeGenusRow> {
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
): OperatorTableCommands<FoundationCommand, SafeSpeciesRow> {
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

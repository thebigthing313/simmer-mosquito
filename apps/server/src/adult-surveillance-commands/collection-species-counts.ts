import { type MutationWriteResult, sql } from '@simmer-mosquito/db';
import {
	type AdultSurveillanceCommand,
	addCollectionSpeciesCountCommand,
	deleteCollectionSpeciesCountCommand,
	updateCollectionSpeciesCountCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	type AdultSurveillanceDb,
	type AdultSurveillanceTransaction,
	agencyCommandContext,
	type CommandContext,
	collectionSpeciesReturnColumns,
	createCommand,
	handleCommandError,
	localDateColumn,
	readCurrentTransactionId,
	readJsonObject,
	readNullableText,
	readNumber,
	readSpeciesSex,
	readSpeciesStatus,
	readText,
	type SafeCollectionSpecies,
	toSafeCollectionSpecies,
} from './shared.js';

// ---------------------------------------------------------------------------
// Collection species counts
// ---------------------------------------------------------------------------

export function registerCollectionSpeciesRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: AdultSurveillanceDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post(
		'/adult-surveillance/collection-species',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}

			const ctx = agencyCommandContext(context.get('authContext'));
			const commandResult = createCommand(() =>
				addCollectionSpeciesCountCommand({
					...ctx,
					collectionSpeciesId: readText(raw.payload.id) ?? '',
					collectionId: readText(raw.payload.collectionId) ?? '',
					speciesId: readText(raw.payload.speciesId) ?? '',
					count: readNumber(raw.payload.count) ?? Number.NaN,
					sex: readSpeciesSex(raw.payload.sex),
					status: readSpeciesStatus(raw.payload.status),
					identifiedByProfileId: readNullableText(raw.payload.identifiedByProfileId),
					identifiedDate: readText(raw.payload.identifiedDate) ?? '',
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runCollectionSpeciesCommands(context, options.db, [commandResult.command], 201);
		},
	);

	app.patch(
		'/adult-surveillance/collection-species/:collectionSpeciesId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}

			const ctx = agencyCommandContext(context.get('authContext'));
			const payload = raw.payload;
			const commandResult = createCommand(() =>
				updateCollectionSpeciesCountCommand({
					...ctx,
					collectionSpeciesId: context.req.param('collectionSpeciesId'),
					...('count' in payload ? { count: readNumber(payload.count) ?? Number.NaN } : {}),
					...('speciesId' in payload ? { speciesId: readText(payload.speciesId) ?? '' } : {}),
					...('sex' in payload ? { sex: readSpeciesSex(payload.sex) } : {}),
					...('status' in payload ? { status: readSpeciesStatus(payload.status) } : {}),
					...('identifiedByProfileId' in payload
						? { identifiedByProfileId: readNullableText(payload.identifiedByProfileId) }
						: {}),
					...('identifiedDate' in payload
						? { identifiedDate: readText(payload.identifiedDate) ?? '' }
						: {}),
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runCollectionSpeciesCommands(context, options.db, [commandResult.command]);
		},
	);

	app.delete(
		'/adult-surveillance/collection-species/:collectionSpeciesId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const commandResult = createCommand(() =>
				deleteCollectionSpeciesCountCommand({
					...ctx,
					collectionSpeciesId: context.req.param('collectionSpeciesId'),
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runCollectionSpeciesCommands(context, options.db, [commandResult.command]);
		},
	);
}

async function runCollectionSpeciesCommands(
	context: CommandContext,
	db: AdultSurveillanceDb,
	commands: readonly AdultSurveillanceCommand[],
	createdStatus?: 201,
) {
	const denial = denyUnauthorizedAgencyCommands(context, commands);
	if (denial !== null) {
		return denial;
	}

	try {
		const result = await writeCollectionSpeciesCommands(db, commands);
		if (result.row === null) {
			return context.json({ error: 'collection_species_not_found' }, 404);
		}
		return context.json({ collectionSpecies: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeCollectionSpeciesCommands(
	db: AdultSurveillanceDb,
	commands: readonly AdultSurveillanceCommand[],
): Promise<MutationWriteResult<SafeCollectionSpecies | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeCollectionSpecies | null = null;
		for (const command of commands) {
			row = await writeCollectionSpeciesCommand(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

async function writeCollectionSpeciesCommand(
	trx: AdultSurveillanceTransaction,
	command: AdultSurveillanceCommand,
): Promise<SafeCollectionSpecies | null> {
	switch (command.type) {
		case 'adultSurveillance.addCollectionSpeciesCount': {
			const row = await trx
				.insertInto('collection_species')
				.values({
					id: command.payload.collectionSpeciesId,
					organization_id: command.payload.organizationId,
					collection_id: command.payload.collectionId,
					species_id: command.payload.speciesId,
					count: command.payload.count,
					sex: command.payload.sex,
					status: command.payload.status,
					identified_by_profile_id: command.payload.identifiedByProfileId,
					identified_date: localDateColumn(command.payload.identifiedDate),
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(collectionSpeciesReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeCollectionSpecies(row);
		}
		case 'adultSurveillance.updateCollectionSpeciesCount': {
			const changes = command.payload.changes;
			const row = await trx
				.updateTable('collection_species')
				.set({
					...('count' in changes ? { count: changes.count } : {}),
					...('speciesId' in changes ? { species_id: changes.speciesId } : {}),
					...('sex' in changes ? { sex: changes.sex ?? null } : {}),
					...('status' in changes ? { status: changes.status ?? null } : {}),
					...('identifiedByProfileId' in changes
						? { identified_by_profile_id: changes.identifiedByProfileId ?? null }
						: {}),
					...('identifiedDate' in changes && changes.identifiedDate !== undefined
						? { identified_date: localDateColumn(changes.identifiedDate) }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.collectionSpeciesId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(collectionSpeciesReturnColumns)
				.executeTakeFirst();
			return row === undefined ? null : toSafeCollectionSpecies(row);
		}
		case 'adultSurveillance.deleteCollectionSpeciesCount': {
			const row = await trx
				.updateTable('collection_species')
				.set({
					deleted_at: sql`now()`,
					deleted_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.collectionSpeciesId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(collectionSpeciesReturnColumns)
				.executeTakeFirst();
			return row === undefined ? null : toSafeCollectionSpecies(row);
		}
		default:
			throw new Error(`Unsupported collection species command: ${command.type}`);
	}
}

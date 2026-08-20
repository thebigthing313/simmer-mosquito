import { sql } from '@simmer-mosquito/db';
import {
	type AdultSurveillanceCommand,
	addCollectionSpeciesCountCommand,
	deleteCollectionSpeciesCountCommand,
	updateCollectionSpeciesCountCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { readNullableText, readNumber, readText } from '../command-payload.js';
import {
	type AdultSurveillanceDb,
	type AdultSurveillanceTransaction,
	type CollectionSpeciesRow,
	type CommandContext,
	collectionSpeciesReturnColumns,
	commandEndpoint,
	localDateColumn,
	readSpeciesSex,
	readSpeciesStatus,
	runCommands,
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
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				addCollectionSpeciesCountCommand({
					...ctx,
					collectionSpeciesId: readText(payload.id) ?? '',
					collectionId: readText(payload.collectionId) ?? '',
					speciesId: readText(payload.speciesId) ?? '',
					count: readNumber(payload.count) ?? Number.NaN,
					sex: readSpeciesSex(payload.sex),
					status: readSpeciesStatus(payload.status),
					identifiedByProfileId: readNullableText(payload.identifiedByProfileId),
					identifiedDate: readText(payload.identifiedDate) ?? '',
				}),
			run: (context, commands) => runCollectionSpeciesCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/adult-surveillance/collection-species/:collectionSpeciesId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx, param }) =>
				updateCollectionSpeciesCountCommand({
					...ctx,
					collectionSpeciesId: param('collectionSpeciesId'),
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
			run: (context, commands) => runCollectionSpeciesCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/adult-surveillance/collection-species/:collectionSpeciesId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				deleteCollectionSpeciesCountCommand({
					...ctx,
					collectionSpeciesId: param('collectionSpeciesId'),
				}),
			run: (context, commands) => runCollectionSpeciesCommands(context, options.db, commands),
		}),
	);
}

async function runCollectionSpeciesCommands(
	context: CommandContext,
	db: AdultSurveillanceDb,
	commands: readonly AdultSurveillanceCommand[],
	createdStatus?: 201,
) {
	return runCommands(
		context,
		{
			db,
			write: writeCollectionSpeciesCommand,
			notFound: 'collection_species_not_found',
			key: 'collectionSpecies',
		},
		commands,
		createdStatus,
	);
}

/** Exported for `table-commands/collection-species.ts` — see `writeHabitatCommand`. */
export async function writeCollectionSpeciesCommand(
	trx: AdultSurveillanceTransaction,
	command: AdultSurveillanceCommand,
): Promise<CollectionSpeciesRow | null> {
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
			return row;
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
			return row ?? null;
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
			return row ?? null;
		}
		default:
			throw new Error(`Unsupported collection species command: ${command.type}`);
	}
}

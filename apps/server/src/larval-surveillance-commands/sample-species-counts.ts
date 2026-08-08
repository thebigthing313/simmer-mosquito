import { sql } from '@simmer-mosquito/db';
import {
	addSampleSpeciesCountCommand,
	deleteSampleSpeciesCountCommand,
	type LarvalSurveillanceCommand,
	updateSampleSpeciesCountCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { readNullableText, readNumber, readText } from '../command-payload.js';
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	type CommandContext,
	commandActor,
	commandEndpoint,
	handleCommandError,
	type LarvalSurveillanceDb,
	type LarvalSurveillanceTransaction,
	localDateColumn,
	type SafeSampleSpecies,
	sampleSpeciesReturnColumns,
	toSafeSampleSpecies,
	writeCommands,
} from './shared.js';

// ---------------------------------------------------------------------------
// Sample species counts
// ---------------------------------------------------------------------------

export function registerSampleSpeciesRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: LarvalSurveillanceDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post(
		'/larval-surveillance/sample-species',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				addSampleSpeciesCountCommand({
					...ctx,
					sampleSpeciesId: readText(payload.id) ?? '',
					sampleId: readText(payload.sampleId) ?? '',
					speciesId: readText(payload.speciesId) ?? '',
					larvaeCount: readNumber(payload.larvaeCount) ?? Number.NaN,
					identifiedByProfileId: readNullableText(payload.identifiedByProfileId),
					identifiedAt: readText(payload.identifiedAt) ?? '',
				}),
			run: (context, commands) => runSampleSpeciesCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/larval-surveillance/sample-species/:sampleSpeciesId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx, param }) =>
				updateSampleSpeciesCountCommand({
					...ctx,
					sampleSpeciesId: param('sampleSpeciesId'),
					...('speciesId' in payload ? { speciesId: readText(payload.speciesId) ?? '' } : {}),
					...('larvaeCount' in payload
						? { larvaeCount: readNumber(payload.larvaeCount) ?? Number.NaN }
						: {}),
					...('identifiedByProfileId' in payload
						? { identifiedByProfileId: readNullableText(payload.identifiedByProfileId) }
						: {}),
					...('identifiedAt' in payload
						? { identifiedAt: readText(payload.identifiedAt) ?? '' }
						: {}),
				}),
			run: (context, commands) => runSampleSpeciesCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/larval-surveillance/sample-species/:sampleSpeciesId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				deleteSampleSpeciesCountCommand({
					...ctx,
					sampleSpeciesId: param('sampleSpeciesId'),
				}),
			run: (context, commands) => runSampleSpeciesCommands(context, options.db, commands),
		}),
	);
}

async function runSampleSpeciesCommands(
	context: CommandContext,
	db: LarvalSurveillanceDb,
	commands: readonly LarvalSurveillanceCommand[],
	createdStatus?: 201,
) {
	const denial = denyUnauthorizedAgencyCommands(context, commands);
	if (denial !== null) {
		return denial;
	}

	try {
		const result = await writeCommands(
			db,
			commandActor(context.get('authContext')),
			commands,
			writeSampleSpeciesCommand,
		);
		if (result.row === null) {
			return context.json({ error: 'sample_species_not_found' }, 404);
		}
		return context.json({ sampleSpecies: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeSampleSpeciesCommand(
	trx: LarvalSurveillanceTransaction,
	command: LarvalSurveillanceCommand,
): Promise<SafeSampleSpecies | null> {
	switch (command.type) {
		case 'larvalSurveillance.addSampleSpeciesCount': {
			const row = await trx
				.insertInto('sample_species')
				.values({
					id: command.payload.sampleSpeciesId,
					organization_id: command.payload.organizationId,
					sample_id: command.payload.sampleId,
					species_id: command.payload.speciesId,
					larvae_count: command.payload.larvaeCount,
					identified_by_profile_id: command.payload.identifiedByProfileId,
					identified_at: localDateColumn(command.payload.identifiedAt),
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(sampleSpeciesReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeSampleSpecies(row);
		}
		case 'larvalSurveillance.updateSampleSpeciesCount': {
			const changes = command.payload.changes;
			const row = await trx
				.updateTable('sample_species')
				.set({
					...('speciesId' in changes ? { species_id: changes.speciesId } : {}),
					...('larvaeCount' in changes ? { larvae_count: changes.larvaeCount } : {}),
					...('identifiedByProfileId' in changes
						? { identified_by_profile_id: changes.identifiedByProfileId ?? null }
						: {}),
					...('identifiedAt' in changes && changes.identifiedAt !== undefined
						? { identified_at: localDateColumn(changes.identifiedAt) }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.sampleSpeciesId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(sampleSpeciesReturnColumns)
				.executeTakeFirst();
			return row === undefined ? null : toSafeSampleSpecies(row);
		}
		case 'larvalSurveillance.deleteSampleSpeciesCount': {
			const row = await trx
				.updateTable('sample_species')
				.set({
					deleted_at: sql`now()`,
					deleted_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.sampleSpeciesId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(sampleSpeciesReturnColumns)
				.executeTakeFirst();
			return row === undefined ? null : toSafeSampleSpecies(row);
		}
		default:
			throw new Error(`Unsupported sample species command: ${command.type}`);
	}
}

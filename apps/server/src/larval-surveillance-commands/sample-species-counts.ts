import { type MutationWriteResult, sql } from '@simmer-mosquito/db';
import {
	addSampleSpeciesCountCommand,
	deleteSampleSpeciesCountCommand,
	type LarvalSurveillanceCommand,
	updateSampleSpeciesCountCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	agencyCommandContext,
	type CommandContext,
	createCommand,
	handleCommandError,
	type LarvalSurveillanceDb,
	type LarvalSurveillanceTransaction,
	localDateColumn,
	readCurrentTransactionId,
	readJsonObject,
	readNullableText,
	readNumber,
	readText,
	type SafeSampleSpecies,
	sampleSpeciesReturnColumns,
	toSafeSampleSpecies,
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
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}

			const ctx = agencyCommandContext(context.get('authContext'));
			const commandResult = createCommand(() =>
				addSampleSpeciesCountCommand({
					...ctx,
					sampleSpeciesId: readText(raw.payload.id) ?? '',
					sampleId: readText(raw.payload.sampleId) ?? '',
					speciesId: readText(raw.payload.speciesId) ?? '',
					larvaeCount: readNumber(raw.payload.larvaeCount) ?? Number.NaN,
					identifiedByProfileId: readNullableText(raw.payload.identifiedByProfileId),
					identifiedAt: readText(raw.payload.identifiedAt) ?? '',
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runSampleSpeciesCommands(context, options.db, [commandResult.command], 201);
		},
	);

	app.patch(
		'/larval-surveillance/sample-species/:sampleSpeciesId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}

			const ctx = agencyCommandContext(context.get('authContext'));
			const payload = raw.payload;
			const commandResult = createCommand(() =>
				updateSampleSpeciesCountCommand({
					...ctx,
					sampleSpeciesId: context.req.param('sampleSpeciesId'),
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
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runSampleSpeciesCommands(context, options.db, [commandResult.command]);
		},
	);

	app.delete(
		'/larval-surveillance/sample-species/:sampleSpeciesId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const commandResult = createCommand(() =>
				deleteSampleSpeciesCountCommand({
					...ctx,
					sampleSpeciesId: context.req.param('sampleSpeciesId'),
				}),
			);
			if (!commandResult.ok) {
				return context.json(commandResult.body, 400);
			}

			return runSampleSpeciesCommands(context, options.db, [commandResult.command]);
		},
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
		const result = await writeSampleSpeciesCommands(db, commands);
		if (result.row === null) {
			return context.json({ error: 'sample_species_not_found' }, 404);
		}
		return context.json({ sampleSpecies: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeSampleSpeciesCommands(
	db: LarvalSurveillanceDb,
	commands: readonly LarvalSurveillanceCommand[],
): Promise<MutationWriteResult<SafeSampleSpecies | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeSampleSpecies | null = null;
		for (const command of commands) {
			row = await writeSampleSpeciesCommand(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
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

import { applyRecordDeletion, type MutationWriteResult, sql } from '@simmer-mosquito/db';
import {
	addInspectionSampleCommand,
	addUnlabeledInspectionSampleCommand,
	clearSampleZeroLarvaeCommand,
	deleteInspectionSampleCommand,
	type LarvalSurveillanceCommand,
	markSampleZeroLarvaeCommand,
	setSampleNonMosquitoPresenceCommand,
	setSampleUnidentifiableReasonCommand,
	updateInspectionSampleCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import { readNullableText, readText } from '../command-payload.js';
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	agencyCommandContext,
	type CommandContext,
	commandEndpoint,
	createCommand,
	handleCommandError,
	type InvalidCommandBody,
	invalidUpdate,
	type LarvalSurveillanceDb,
	type LarvalSurveillanceTransaction,
	readCurrentTransactionId,
	type SafeSample,
	type SampleUpdateColumns,
	sampleReturnColumns,
	toSafeSample,
} from './shared.js';

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

export function registerSampleRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: LarvalSurveillanceDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post(
		'/larval-surveillance/samples',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) => {
				const displayName = readNullableText(payload.displayName);
				return displayName !== null
					? addInspectionSampleCommand({
							...ctx,
							sampleId: readText(payload.id) ?? '',
							inspectionId: readText(payload.inspectionId) ?? '',
							displayName,
						})
					: addUnlabeledInspectionSampleCommand({
							...ctx,
							sampleId: readText(payload.id) ?? '',
							inspectionId: readText(payload.inspectionId) ?? '',
						});
			},
			run: (context, commands) => runSampleCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/larval-surveillance/samples/:sampleId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, authContext, param }) =>
				buildSampleUpdateCommands(authContext, param('sampleId'), payload),
			run: (context, commands) => runSampleCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/larval-surveillance/samples/:sampleId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'optional',
			build: ({ payload, agency: ctx, param }) =>
				deleteInspectionSampleCommand({
					...ctx,
					sampleId: param('sampleId'),
					acknowledgedAssociatedRecordsDeletion:
						payload.acknowledgedAssociatedRecordsDeletion !== false,
				}),
			run: (context, commands) => runSampleCommands(context, options.db, commands),
		}),
	);
}

function buildSampleUpdateCommands(
	authContext: AuthContext,
	sampleId: string,
	payload: Record<string, unknown>,
):
	| { readonly ok: true; readonly commands: readonly LarvalSurveillanceCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	const ctx = agencyCommandContext(authContext);
	const commands: LarvalSurveillanceCommand[] = [];

	if ('displayName' in payload) {
		const result = createCommand(() =>
			updateInspectionSampleCommand({
				...ctx,
				sampleId,
				displayName: readText(payload.displayName) ?? '',
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (typeof payload.isZeroLarvae === 'boolean') {
		const result = createCommand(() =>
			payload.isZeroLarvae
				? markSampleZeroLarvaeCommand({ ...ctx, sampleId })
				: clearSampleZeroLarvaeCommand({ ...ctx, sampleId }),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (typeof payload.hasNonMosquito === 'boolean') {
		const result = createCommand(() =>
			setSampleNonMosquitoPresenceCommand({
				...ctx,
				sampleId,
				hasNonMosquito: payload.hasNonMosquito === true,
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if ('unidentifiableReason' in payload) {
		const result = createCommand(() =>
			setSampleUnidentifiableReasonCommand({
				...ctx,
				sampleId,
				unidentifiableReason: readNullableText(payload.unidentifiableReason),
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('sample');
	}

	return { ok: true, commands };
}

async function runSampleCommands(
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
		const result = await writeSampleCommands(db, commands);
		if (result.row === null) {
			return context.json({ error: 'sample_not_found' }, 404);
		}
		return context.json({ sample: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeSampleCommands(
	db: LarvalSurveillanceDb,
	commands: readonly LarvalSurveillanceCommand[],
): Promise<MutationWriteResult<SafeSample | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeSample | null = null;
		for (const command of commands) {
			row = await writeSampleCommand(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

async function writeSampleCommand(
	trx: LarvalSurveillanceTransaction,
	command: LarvalSurveillanceCommand,
): Promise<SafeSample | null> {
	switch (command.type) {
		case 'larvalSurveillance.addInspectionSample':
			return insertSample(trx, {
				id: command.payload.sampleId,
				organizationId: command.payload.organizationId,
				inspectionId: command.payload.inspectionId,
				displayName: command.payload.displayName,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.addUnlabeledInspectionSample':
			return insertSample(trx, {
				id: command.payload.sampleId,
				organizationId: command.payload.organizationId,
				inspectionId: command.payload.inspectionId,
				displayName: null,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.updateInspectionSample':
			return updateSample(trx, command.payload.sampleId, command.payload.organizationId, {
				...(command.payload.changes.displayName !== undefined
					? { display_name: command.payload.changes.displayName }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.markSampleZeroLarvae':
			return updateSample(trx, command.payload.sampleId, command.payload.organizationId, {
				is_zero_larvae: true,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.clearSampleZeroLarvae':
			return updateSample(trx, command.payload.sampleId, command.payload.organizationId, {
				is_zero_larvae: false,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.setSampleNonMosquitoPresence':
			return updateSample(trx, command.payload.sampleId, command.payload.organizationId, {
				has_non_mosquito: command.payload.hasNonMosquito,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.setSampleUnidentifiableReason':
			return updateSample(trx, command.payload.sampleId, command.payload.organizationId, {
				unidentifiable_reason: command.payload.unidentifiableReason,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'larvalSurveillance.deleteInspectionSample': {
			await applyRecordDeletion(trx, {
				recordType: 'sample',
				recordId: command.payload.sampleId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
			const row = await trx
				.updateTable('samples')
				.set({
					deleted_at: sql`now()`,
					deleted_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: sql`now()`,
				})
				.where('id', '=', command.payload.sampleId)
				.where('organization_id', '=', command.payload.organizationId)
				.where('deleted_at', 'is', null)
				.returning(sampleReturnColumns)
				.executeTakeFirst();
			return row === undefined ? null : toSafeSample(row);
		}
		default:
			throw new Error(`Unsupported sample command: ${command.type}`);
	}
}

async function insertSample(
	trx: LarvalSurveillanceTransaction,
	input: {
		readonly id: string;
		readonly organizationId: string;
		readonly inspectionId: string;
		readonly displayName: string | null;
		readonly actorProfileId: string;
	},
): Promise<SafeSample> {
	const row = await trx
		.insertInto('samples')
		.values({
			id: input.id,
			organization_id: input.organizationId,
			inspection_id: input.inspectionId,
			display_name: input.displayName,
			is_zero_larvae: false,
			has_non_mosquito: false,
			created_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
		})
		.returning(sampleReturnColumns)
		.executeTakeFirstOrThrow();
	return toSafeSample(row);
}

async function updateSample(
	trx: LarvalSurveillanceTransaction,
	sampleId: string,
	organizationId: string,
	set: SampleUpdateColumns,
): Promise<SafeSample | null> {
	const row = await trx
		.updateTable('samples')
		.set({ ...set, updated_at: sql`now()` })
		.where('id', '=', sampleId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(sampleReturnColumns)
		.executeTakeFirst();
	return row === undefined ? null : toSafeSample(row);
}

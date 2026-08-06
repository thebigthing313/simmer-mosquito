import { applyRecordDeletion, type MutationWriteResult, sql } from '@simmer-mosquito/db';
import {
	type ControlActionLocationSourceInput,
	type ControlOperationsCommand,
	deleteChemicalApplicationCommand,
	recordChemicalApplicationCommand,
	updateChemicalApplicationFieldDetailsCommand,
	updateChemicalApplicationLocationAndContextCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import { readNullableText, readNumber, readText } from '../command-payload.js';
import { type CommandActor, denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	type ApplicationUpdateColumns,
	agencyCommandContext,
	applicationReturnColumns,
	assertActionOwnership,
	type CommandContext,
	type CommandsResult,
	type ControlOperationsDb,
	type ControlOperationsTransaction,
	commandActor,
	contextIds,
	createCommand,
	handleCommandError,
	hasLocationContextChange,
	insertApplicationBatch,
	invalidUpdate,
	localDateColumn,
	locationContextColumns,
	locationContextInput,
	type RouteOptions,
	readControlActionContext,
	readCurrentTransactionId,
	readJsonObject,
	resolveGeom,
	type SafeApplication,
	softDelete,
	toSafeApplication,
} from './shared.js';

// ===========================================================================
// Chemical applications
// ===========================================================================

export function registerApplicationRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/control-operations/applications', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const p = raw.payload;
		const result = createCommand(() =>
			recordChemicalApplicationCommand({
				...ctx,
				applicationId: readText(p.id) ?? '',
				insecticideId: readText(p.insecticideId) ?? '',
				amountApplied: readNumber(p.amountApplied) ?? Number.NaN,
				applicationUnitId: readText(p.applicationUnitId) ?? '',
				applicationDate: readText(p.applicationDate) ?? '',
				applicatorProfileId: readNullableText(p.applicatorProfileId),
				locationSource: p.locationSource as ControlActionLocationSourceInput,
				addressId: readNullableText(p.addressId),
				context: readControlActionContext(p),
				requestedControlActionId: readNullableText(p.requestedControlActionId),
				applicationMethodId: readNullableText(p.applicationMethodId),
				vehicleId: readNullableText(p.vehicleId),
				equipmentId: readNullableText(p.equipmentId),
				metadata: p.metadata ?? null,
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runApplicationCommands(context, options.db, [result.command], 201);
	});

	app.patch(
		'/control-operations/applications/:applicationId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const commandsResult = buildApplicationUpdateCommands(
				context.get('authContext'),
				context.req.param('applicationId'),
				raw.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}
			return runApplicationCommands(context, options.db, commandsResult.commands);
		},
	);

	app.delete(
		'/control-operations/applications/:applicationId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				deleteChemicalApplicationCommand({
					...ctx,
					applicationId: context.req.param('applicationId'),
					acknowledgedSupportRecordDeletion: true,
					acknowledgedBatchDeletion: true,
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runApplicationCommands(context, options.db, [result.command]);
		},
	);
}

function buildApplicationUpdateCommands(
	authContext: AuthContext,
	applicationId: string,
	payload: Record<string, unknown>,
): CommandsResult {
	const ctx = agencyCommandContext(authContext);
	const commands: ControlOperationsCommand[] = [];

	const fieldKeys = [
		'applicationDate',
		'applicatorProfileId',
		'applicationMethodId',
		'insecticideId',
		'amountApplied',
		'applicationUnitId',
		'vehicleId',
		'equipmentId',
		'metadata',
	];
	if (fieldKeys.some((key) => key in payload)) {
		const result = createCommand(() =>
			updateChemicalApplicationFieldDetailsCommand({
				...ctx,
				applicationId,
				...('applicationDate' in payload
					? { applicationDate: readText(payload.applicationDate) ?? '' }
					: {}),
				...('applicatorProfileId' in payload
					? { applicatorProfileId: readNullableText(payload.applicatorProfileId) }
					: {}),
				...('applicationMethodId' in payload
					? { applicationMethodId: readNullableText(payload.applicationMethodId) }
					: {}),
				...('insecticideId' in payload
					? { insecticideId: readText(payload.insecticideId) ?? '' }
					: {}),
				...('amountApplied' in payload
					? { amountApplied: readNumber(payload.amountApplied) ?? Number.NaN }
					: {}),
				...('applicationUnitId' in payload
					? { applicationUnitId: readText(payload.applicationUnitId) ?? '' }
					: {}),
				...('vehicleId' in payload ? { vehicleId: readNullableText(payload.vehicleId) } : {}),
				...('equipmentId' in payload ? { equipmentId: readNullableText(payload.equipmentId) } : {}),
				...('metadata' in payload ? { metadata: payload.metadata ?? null } : {}),
				acknowledgedBatchClearance: true,
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (hasLocationContextChange(payload)) {
		const result = createCommand(() =>
			updateChemicalApplicationLocationAndContextCommand({
				...ctx,
				applicationId,
				...locationContextInput(payload),
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('application');
	}
	return { ok: true, commands };
}

async function runApplicationCommands(
	context: CommandContext,
	db: ControlOperationsDb,
	commands: readonly ControlOperationsCommand[],
	createdStatus?: 201,
) {
	const denial = denyUnauthorizedAgencyCommands(context, commands);
	if (denial !== null) {
		return denial;
	}

	try {
		const result = await writeApplicationCommands(
			db,
			commandActor(context.get('authContext')),
			commands,
		);
		if (result.row === null) {
			return context.json({ error: 'application_not_found' }, 404);
		}
		return context.json({ application: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeApplicationCommands(
	db: ControlOperationsDb,
	actor: CommandActor,
	commands: readonly ControlOperationsCommand[],
): Promise<MutationWriteResult<SafeApplication | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeApplication | null = null;
		for (const command of commands) {
			await assertActionOwnership(trx, command, actor);
			row = await writeApplicationCommand(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

async function writeApplicationCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<SafeApplication | null> {
	switch (command.type) {
		case 'controlOperations.recordChemicalApplication': {
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('applications')
				.values({
					id: command.payload.applicationId,
					organization_id: command.payload.organizationId,
					application_method_id: command.payload.applicationMethodId,
					insecticide_id: command.payload.insecticideId,
					applicator_profile_id: command.payload.applicatorProfileId,
					application_date: localDateColumn(command.payload.applicationDate),
					geom: await resolveGeom(
						trx,
						command.payload.organizationId,
						command.payload.locationSource,
					),
					address_id: command.payload.addressId,
					vehicle_id: command.payload.vehicleId,
					equipment_id: command.payload.equipmentId,
					amount_applied: command.payload.amountApplied,
					application_unit_id: command.payload.applicationUnitId,
					habitat_id: ids.habitatId,
					collection_id: ids.collectionId,
					inspection_id: ids.inspectionId,
					requested_control_action_id: command.payload.requestedControlActionId,
					metadata: command.payload.metadata,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(applicationReturnColumns)
				.executeTakeFirstOrThrow();
			for (const batch of command.payload.applicationBatches) {
				await insertApplicationBatch(trx, {
					id: batch.applicationBatchId,
					organizationId: command.payload.organizationId,
					applicationId: command.payload.applicationId,
					insecticideBatchId: batch.insecticideBatchId,
					actorProfileId: command.payload.actorProfileId,
				});
			}
			return toSafeApplication(row);
		}
		case 'controlOperations.updateChemicalApplicationFieldDetails': {
			const changes = command.payload.changes;
			return updateApplication(trx, command.payload.applicationId, command.payload.organizationId, {
				...('applicationDate' in changes && changes.applicationDate !== undefined
					? { application_date: localDateColumn(changes.applicationDate) }
					: {}),
				...('applicatorProfileId' in changes
					? { applicator_profile_id: changes.applicatorProfileId ?? null }
					: {}),
				...('applicationMethodId' in changes
					? { application_method_id: changes.applicationMethodId ?? null }
					: {}),
				...('insecticideId' in changes ? { insecticide_id: changes.insecticideId } : {}),
				...('amountApplied' in changes ? { amount_applied: changes.amountApplied } : {}),
				...('applicationUnitId' in changes
					? { application_unit_id: changes.applicationUnitId }
					: {}),
				...('vehicleId' in changes ? { vehicle_id: changes.vehicleId ?? null } : {}),
				...('equipmentId' in changes ? { equipment_id: changes.equipmentId ?? null } : {}),
				...('metadata' in changes ? { metadata: changes.metadata ?? null } : {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		}
		case 'controlOperations.updateChemicalApplicationLocationAndContext':
			return updateApplication(trx, command.payload.applicationId, command.payload.organizationId, {
				...(await locationContextColumns(
					trx,
					command.payload.organizationId,
					command.payload.changes,
					{
						collection: true,
					},
				)),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'controlOperations.deleteChemicalApplication':
			await applyRecordDeletion(trx, {
				recordType: 'application',
				recordId: command.payload.applicationId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
			return softDelete(
				trx,
				'applications',
				command.payload.applicationId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				applicationReturnColumns,
				toSafeApplication,
			);
		default:
			throw new Error(`Unsupported application command: ${command.type}`);
	}
}

async function updateApplication(
	trx: ControlOperationsTransaction,
	applicationId: string,
	organizationId: string,
	set: ApplicationUpdateColumns,
): Promise<SafeApplication | null> {
	const row = await trx
		.updateTable('applications')
		.set({ ...set, updated_at: sql`now()` })
		.where('id', '=', applicationId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(applicationReturnColumns)
		.executeTakeFirst();
	return row === undefined ? null : toSafeApplication(row);
}

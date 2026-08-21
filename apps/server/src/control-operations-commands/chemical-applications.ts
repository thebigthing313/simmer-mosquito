import {
	applyRecordDeletion,
	assertWriteReferences,
	type CatalogReference,
	checkedValues,
	sql,
} from '@simmer-mosquito/db';
import {
	type ControlActionLocationSourceInput,
	type ControlOperationsCommand,
	deleteChemicalApplicationCommand,
	type RecordChemicalApplicationForMissionItemCommand,
	recordChemicalApplicationCommand,
	recordChemicalApplicationForMissionItemCommand,
	updateChemicalApplicationFieldDetailsCommand,
	updateChemicalApplicationLocationAndContextCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import {
	readMissionExecutionOptions,
	readNullableText,
	readNumber,
	readText,
} from '../command-payload.js';
import {
	assertMissionGeometryCovered,
	beginMissionExecution,
	defaultMissionMethodId,
	finishMissionExecution,
	missionItemGeom,
} from '../mission-dispatch-commands/mission-execution.js';
import {
	type AgencyContext,
	type ApplicationRow,
	type ApplicationUpdateColumns,
	agencyCommandContext,
	applicationReturnColumns,
	type CommandContext,
	type CommandsResult,
	type ControlOperationsDb,
	type ControlOperationsTransaction,
	commandEndpoint,
	contextIds,
	createCommand,
	hasLocationContextChange,
	insertApplicationBatch,
	invalidUpdate,
	localDateColumn,
	locationContextColumns,
	locationContextInput,
	type RouteOptions,
	readControlActionContext,
	resolveGeom,
	runCommands,
	softDelete,
} from './shared.js';

// ===========================================================================
// Chemical applications
// ===========================================================================

/** Plus the mission helper, which writes an application and closes the stop. */
export type ApplicationCommand =
	| ControlOperationsCommand
	| RecordChemicalApplicationForMissionItemCommand;

export function registerApplicationRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/control-operations/applications',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) => buildApplicationCreateCommand(ctx, payload),
			run: (context, commands) => runApplicationCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/control-operations/applications/:applicationId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, authContext, param }) =>
				buildApplicationUpdateCommands(authContext, param('applicationId'), payload),
			run: (context, commands) => runApplicationCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/control-operations/applications/:applicationId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				deleteChemicalApplicationCommand({
					...ctx,
					applicationId: param('applicationId'),
					acknowledgedSupportRecordDeletion: true,
					acknowledgedBatchDeletion: true,
				}),
			run: (context, commands) => runApplicationCommands(context, options.db, commands),
		}),
	);
}

/**
 * The create command a request body asks for — the mission execution helper when
 * it names a stop, the ordinary record otherwise.
 *
 * Named and exported, like the `buildCreate` on the other three action configs,
 * so the branch can be tested without a transaction. The context keys are the
 * reason: they were dropped on the mission side and nothing below the endpoint
 * could see it.
 */
export function buildApplicationCreateCommand(
	ctx: AgencyContext,
	payload: Record<string, unknown>,
): ApplicationCommand {
	const missionItemId = readNullableText(payload.missionItemId);
	// Recorded off a mission stop: the application carries the stop and
	// closes it, in the same transaction.
	if (missionItemId !== null) {
		return recordChemicalApplicationForMissionItemCommand({
			...ctx,
			missionItemId,
			applicationId: readText(payload.id) ?? '',
			insecticideId: readText(payload.insecticideId) ?? '',
			amountApplied: readNumber(payload.amountApplied) ?? Number.NaN,
			applicationUnitId: readText(payload.applicationUnitId) ?? '',
			applicationDate: readText(payload.applicationDate) ?? '',
			applicatorProfileId: readNullableText(payload.applicatorProfileId),
			applicationMethodId: readNullableText(payload.applicationMethodId),
			vehicleId: readNullableText(payload.vehicleId),
			equipmentId: readNullableText(payload.equipmentId),
			...(payload.geometry === undefined ? {} : { geometry: payload.geometry }),
			addressId: readNullableText(payload.addressId),
			// The larval/adult context the record was made in is the record's own,
			// not the mission's. Reading it here is what keeps a mission-recorded
			// application from storing less than the same application recorded off
			// one — the form sends the same keys either way.
			context: readControlActionContext(payload),
			requestedControlActionId: readNullableText(payload.requestedControlActionId),
			metadata: payload.metadata ?? null,
			...readMissionExecutionOptions(payload),
		});
	}
	return recordChemicalApplicationCommand({
		...ctx,
		applicationId: readText(payload.id) ?? '',
		insecticideId: readText(payload.insecticideId) ?? '',
		amountApplied: readNumber(payload.amountApplied) ?? Number.NaN,
		applicationUnitId: readText(payload.applicationUnitId) ?? '',
		applicationDate: readText(payload.applicationDate) ?? '',
		applicatorProfileId: readNullableText(payload.applicatorProfileId),
		locationSource: payload.locationSource as ControlActionLocationSourceInput,
		addressId: readNullableText(payload.addressId),
		context: readControlActionContext(payload),
		requestedControlActionId: readNullableText(payload.requestedControlActionId),
		applicationMethodId: readNullableText(payload.applicationMethodId),
		vehicleId: readNullableText(payload.vehicleId),
		equipmentId: readNullableText(payload.equipmentId),
		metadata: payload.metadata ?? null,
	});
}

function buildApplicationUpdateCommands(
	authContext: AuthContext,
	applicationId: string,
	payload: Record<string, unknown>,
): CommandsResult {
	const ctx = agencyCommandContext(authContext);
	// Updates never produce a mission helper; only the create path can.
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
	commands: readonly ApplicationCommand[],
	createdStatus?: 201,
) {
	return runCommands(
		context,
		{ db, write: writeApplicationCommand, notFound: 'application_not_found', key: 'application' },
		commands,
		createdStatus,
	);
}

/**
 * The four catalogs a chemical application names.
 *
 * Only the keys present are gated, so an update that moves the amount and
 * nothing else asks nothing of the catalogs, and one that moves the insecticide
 * asks only about that.
 */
function applicationCatalogReferences(source: {
	readonly applicationMethodId?: string | null | undefined;
	readonly insecticideId?: string | null | undefined;
	readonly vehicleId?: string | null | undefined;
	readonly equipmentId?: string | null | undefined;
}): CatalogReference[] {
	const references: CatalogReference[] = [];
	if ('applicationMethodId' in source) {
		references.push({
			column: 'application_method_id',
			catalog: 'applicationMethod',
			id: source.applicationMethodId ?? null,
			label: 'application method',
		});
	}
	if ('insecticideId' in source) {
		references.push({
			column: 'insecticide_id',
			catalog: 'insecticide',
			id: source.insecticideId ?? null,
			label: 'insecticide',
		});
	}
	if ('vehicleId' in source) {
		references.push({
			column: 'vehicle_id',
			catalog: 'vehicle',
			id: source.vehicleId ?? null,
			label: 'vehicle',
		});
	}
	if ('equipmentId' in source) {
		references.push({
			column: 'equipment_id',
			catalog: 'equipment',
			id: source.equipmentId ?? null,
			label: 'equipment record',
		});
	}
	return references;
}

async function writeMissionApplication(
	trx: ControlOperationsTransaction,
	payload: RecordChemicalApplicationForMissionItemCommand['payload'],
): Promise<ApplicationRow | null> {
	const stop = await beginMissionExecution(trx, payload, 'chemicalApplication');
	await assertWriteReferences(trx, {
		organizationId: payload.organizationId,
		write: { kind: 'create' },
		references: applicationCatalogReferences(payload),
	});
	const ids = contextIds(payload.context ?? { kind: 'none' });
	const row = await trx
		.insertInto('applications')
		.values(
			await checkedValues(trx, payload.organizationId, {
				id: payload.applicationId,
				organization_id: payload.organizationId,
				// `defaultMissionMethodId` falls back to the method the mission plan
				// named. Only the payload's own id is gated, above: a plan's method is
				// not a new choice.
				application_method_id: defaultMissionMethodId(payload.applicationMethodId, stop),
				insecticide_id: payload.insecticideId,
				applicator_profile_id: payload.applicatorProfileId,
				application_date: localDateColumn(payload.applicationDate),
				geom: missionItemGeom(payload.missionItemId, payload.geometry),
				address_id: payload.addressId ?? null,
				vehicle_id: payload.vehicleId,
				equipment_id: payload.equipmentId,
				amount_applied: payload.amountApplied,
				application_unit_id: payload.applicationUnitId,
				habitat_id: ids.habitatId,
				collection_id: ids.collectionId,
				inspection_id: ids.inspectionId,
				requested_control_action_id: stop.requestedControlActionId,
				mission_item_id: payload.missionItemId,
				metadata: payload.metadata,
				created_by_profile_id: payload.actorProfileId,
				updated_by_profile_id: payload.actorProfileId,
			}),
		)
		.returning(applicationReturnColumns)
		.executeTakeFirstOrThrow();
	for (const batch of payload.applicationBatches) {
		await insertApplicationBatch(trx, {
			id: batch.applicationBatchId,
			organizationId: payload.organizationId,
			applicationId: payload.applicationId,
			insecticideBatchId: batch.insecticideBatchId,
			actorProfileId: payload.actorProfileId,
		});
	}
	await assertMissionGeometryCovered(trx, payload, payload.applicationId, 'applications');
	await finishMissionExecution(trx, payload, stop);
	return row;
}

export async function writeApplicationCommand(
	trx: ControlOperationsTransaction,
	command: ApplicationCommand,
): Promise<ApplicationRow | null> {
	switch (command.type) {
		case 'controlOperations.recordChemicalApplication': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'create' },
				references: applicationCatalogReferences(command.payload),
			});
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('applications')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
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
					}),
				)
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
			return row;
		}
		case 'missionDispatch.recordChemicalApplicationForMissionItem':
			return writeMissionApplication(trx, command.payload);
		case 'controlOperations.updateChemicalApplicationFieldDetails': {
			const changes = command.payload.changes;
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'update', table: 'applications', recordId: command.payload.applicationId },
				references: applicationCatalogReferences(changes),
			});
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
): Promise<ApplicationRow | null> {
	const row = await trx
		.updateTable('applications')
		.set({ ...set, updated_at: sql`now()` })
		.where('id', '=', applicationId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(applicationReturnColumns)
		.executeTakeFirst();
	return row ?? null;
}

import {
	applyRecordDeletion,
	assertWriteReferences,
	type CatalogRecordType,
	type CatalogReference,
	checkedValues,
} from '@simmer-mosquito/db';
import {
	type ControlActionLocationSourceInput,
	type ControlOperationsCommand,
	deleteBiocontrolActionCommand,
	deleteOutreachActionCommand,
	deleteSourceReductionCommand,
	type RecordBiocontrolActionForMissionItemCommand,
	type RecordOutreachActionForMissionItemCommand,
	type RecordSourceReductionForMissionItemCommand,
	recordBiocontrolActionCommand,
	recordBiocontrolActionForMissionItemCommand,
	recordOutreachActionCommand,
	recordOutreachActionForMissionItemCommand,
	recordSourceReductionCommand,
	recordSourceReductionForMissionItemCommand,
	updateBiocontrolActionFieldDetailsCommand,
	updateBiocontrolActionLocationAndContextCommand,
	updateOutreachActionFieldDetailsCommand,
	updateOutreachActionLocationAndContextCommand,
	updateSourceReductionFieldDetailsCommand,
	updateSourceReductionLocationAndContextCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
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
	finishMissionExecution,
	missionItemGeom,
	resolveMissionMethodId,
} from '../mission-dispatch-commands/mission-execution.js';
import {
	type AgencyContext,
	type BiocontrolActionRow,
	biocontrolActionReturnColumns,
	type CommandContext,
	type CommandsResult,
	type ControlOperationsDb,
	type ControlOperationsTransaction,
	commandEndpoint,
	contextIds,
	createCommand,
	hasLocationContextChange,
	invalidUpdate,
	localDateColumn,
	locationContextColumns,
	locationContextInput,
	type OutreachActionRow,
	outreachActionReturnColumns,
	type RouteOptions,
	readControlActionContext,
	resolveGeom,
	runCommands,
	type SourceReductionRow,
	softDelete,
	sourceReductionReturnColumns,
	updateActionRow,
} from './shared.js';

// ===========================================================================
// Source reduction / outreach / biocontrol actions (shared shape)
// ===========================================================================

/**
 * What these endpoints can be asked to do.
 *
 * The `missionDispatch.*` helpers are handled here rather than under mission
 * dispatch because the row being written is a control action; the command
 * vocabulary follows the unit of work, the endpoint follows the table. Same
 * split as the assignment execution commands on the surveillance endpoints.
 */
export type ActionCommand =
	| ControlOperationsCommand
	| RecordSourceReductionForMissionItemCommand
	| RecordOutreachActionForMissionItemCommand
	| RecordBiocontrolActionForMissionItemCommand;

interface ActionConfig<TRow> {
	readonly noun: string;
	readonly basePath: string;
	readonly notFoundError: string;
	readonly idParam: string;
	readonly buildCreate: (ctx: AgencyContext, payload: Record<string, unknown>) => ActionCommand;
	readonly buildUpdate: (
		ctx: AgencyContext,
		id: string,
		payload: Record<string, unknown>,
	) => CommandsResult;
	readonly buildDelete: (ctx: AgencyContext, id: string) => ControlOperationsCommand;
	readonly write: (
		trx: ControlOperationsTransaction,
		command: ActionCommand,
	) => Promise<TRow | null>;
	readonly responseKey: string;
}

export function registerActionRoutes<TRow>(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
	config: ActionConfig<TRow>,
): void {
	app.post(
		config.basePath,
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency }) => config.buildCreate(agency, payload),
			run: (context, commands) => runActionCommands(context, options.db, config, commands, 201),
		}),
	);

	app.patch(
		`${config.basePath}/:${config.idParam}`,
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency, param }) =>
				config.buildUpdate(agency, param(config.idParam), payload),
			run: (context, commands) => runActionCommands(context, options.db, config, commands),
		}),
	);

	app.delete(
		`${config.basePath}/:${config.idParam}`,
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency, param }) => config.buildDelete(agency, param(config.idParam)),
			run: (context, commands) => runActionCommands(context, options.db, config, commands),
		}),
	);
}

/**
 * The three performed-action families still share a route *shape* as well as a
 * write tail, which is what `ActionConfig` is for. The tail itself is no longer
 * theirs — this generalized out of here and now serves all 28 endpoints.
 */
async function runActionCommands<TRow>(
	context: CommandContext,
	db: ControlOperationsDb,
	config: ActionConfig<TRow>,
	commands: readonly ActionCommand[],
	createdStatus?: 201,
) {
	return runCommands(
		context,
		{ db, write: config.write, notFound: config.notFoundError, key: config.responseKey },
		commands,
		createdStatus,
	);
}

// --- Source reductions ---

export const sourceReductionConfig: ActionConfig<SourceReductionRow> = {
	noun: 'source reduction',
	basePath: '/control-operations/source-reductions',
	notFoundError: 'source_reduction_not_found',
	idParam: 'sourceReductionId',
	responseKey: 'sourceReduction',
	buildCreate: (ctx, p) => {
		const missionItemId = readNullableText(p.missionItemId);
		// Recorded off a mission stop: the action carries the stop and closes it.
		if (missionItemId !== null) {
			return recordSourceReductionForMissionItemCommand({
				...ctx,
				missionItemId,
				sourceReductionId: readText(p.id) ?? '',
				sourceReductionDate: readText(p.sourceReductionDate) ?? '',
				sourcesEliminatedAmount: readNumber(p.sourcesEliminatedAmount) ?? Number.NaN,
				sourcesEliminatedUnitId: readText(p.sourcesEliminatedUnitId) ?? '',
				sourceReductionMethodId: readText(p.sourceReductionMethodId) ?? '',
				technicianProfileId: readNullableText(p.technicianProfileId),
				...(p.geometry === undefined ? {} : { geometry: p.geometry }),
				addressId: readNullableText(p.addressId),
				// The larval/adult context the record was made in is the record's own,
				// not the mission's — the form sends the same keys either way.
				context: readControlActionContext(p),
				requestedControlActionId: readNullableText(p.requestedControlActionId),
				metadata: p.metadata ?? null,
				...readMissionExecutionOptions(p),
			});
		}
		return recordSourceReductionCommand({
			...ctx,
			sourceReductionId: readText(p.id) ?? '',
			sourceReductionMethodId: readText(p.sourceReductionMethodId) ?? '',
			technicianProfileId: readNullableText(p.technicianProfileId),
			sourceReductionDate: readText(p.sourceReductionDate) ?? '',
			sourcesEliminatedAmount: readNumber(p.sourcesEliminatedAmount) ?? Number.NaN,
			sourcesEliminatedUnitId: readText(p.sourcesEliminatedUnitId) ?? '',
			locationSource: p.locationSource as ControlActionLocationSourceInput,
			addressId: readNullableText(p.addressId),
			context: readControlActionContext(p),
			requestedControlActionId: readNullableText(p.requestedControlActionId),
			metadata: p.metadata ?? null,
		});
	},
	buildUpdate: (ctx, id, payload) => {
		const commands: ControlOperationsCommand[] = [];
		const fieldKeys = [
			'sourceReductionDate',
			'technicianProfileId',
			'sourceReductionMethodId',
			'sourcesEliminatedAmount',
			'sourcesEliminatedUnitId',
			'metadata',
		];
		if (fieldKeys.some((key) => key in payload)) {
			const result = createCommand(() =>
				updateSourceReductionFieldDetailsCommand({
					...ctx,
					sourceReductionId: id,
					...('sourceReductionDate' in payload
						? { sourceReductionDate: readText(payload.sourceReductionDate) ?? '' }
						: {}),
					...('technicianProfileId' in payload
						? { technicianProfileId: readNullableText(payload.technicianProfileId) }
						: {}),
					...('sourceReductionMethodId' in payload
						? { sourceReductionMethodId: readText(payload.sourceReductionMethodId) ?? '' }
						: {}),
					...('sourcesEliminatedAmount' in payload
						? { sourcesEliminatedAmount: readNumber(payload.sourcesEliminatedAmount) ?? Number.NaN }
						: {}),
					...('sourcesEliminatedUnitId' in payload
						? { sourcesEliminatedUnitId: readText(payload.sourcesEliminatedUnitId) ?? '' }
						: {}),
					...('metadata' in payload ? { metadata: payload.metadata ?? null } : {}),
				}),
			);
			if (!result.ok) {
				return result;
			}
			commands.push(result.command);
		}
		if (hasLocationContextChange(payload)) {
			const result = createCommand(() =>
				updateSourceReductionLocationAndContextCommand({
					...ctx,
					sourceReductionId: id,
					...locationContextInput(payload),
				}),
			);
			if (!result.ok) {
				return result;
			}
			commands.push(result.command);
		}
		return commands.length === 0 ? invalidUpdate('source reduction') : { ok: true, commands };
	},
	buildDelete: (ctx, id) =>
		deleteSourceReductionCommand({
			...ctx,
			sourceReductionId: id,
			acknowledgedSupportRecordDeletion: true,
		}),
	write: writeSourceReductionCommand,
};

async function writeMissionSourceReduction(
	trx: ControlOperationsTransaction,
	payload: RecordSourceReductionForMissionItemCommand['payload'],
): Promise<SourceReductionRow | null> {
	const stop = await beginMissionExecution(trx, payload, 'sourceReduction');
	// A method the mission plan supplied is not a new choice, so only an id
	// the payload names is gated.
	await assertWriteReferences(trx, {
		organizationId: payload.organizationId,
		write: { kind: 'create' },
		references: methodReferences('sourceReduction', payload.sourceReductionMethodId),
	});
	const ids = contextIds(payload.context ?? { kind: 'none' });
	const row = await trx
		.insertInto('source_reductions')
		.values(
			await checkedValues(trx, payload.organizationId, {
				id: payload.sourceReductionId,
				organization_id: payload.organizationId,
				source_reduction_method_id: resolveMissionMethodId(payload.sourceReductionMethodId, stop),
				technician_profile_id: payload.technicianProfileId,
				source_reduction_date: localDateColumn(payload.sourceReductionDate),
				sources_eliminated_amount: payload.sourcesEliminatedAmount,
				sources_eliminated_unit_id: payload.sourcesEliminatedUnitId,
				geom: missionItemGeom(payload.missionItemId, payload.geometry),
				address_id: payload.addressId ?? null,
				habitat_id: ids.habitatId,
				inspection_id: ids.inspectionId,
				requested_control_action_id: stop.requestedControlActionId,
				mission_item_id: payload.missionItemId,
				metadata: payload.metadata,
				created_by_profile_id: payload.actorProfileId,
				updated_by_profile_id: payload.actorProfileId,
			}),
		)
		.returning(sourceReductionReturnColumns)
		.executeTakeFirstOrThrow();
	await assertMissionGeometryCovered(trx, payload, payload.sourceReductionId, 'source_reductions');
	await finishMissionExecution(trx, payload, stop);
	return row;
}

async function writeMissionOutreachAction(
	trx: ControlOperationsTransaction,
	payload: RecordOutreachActionForMissionItemCommand['payload'],
): Promise<OutreachActionRow | null> {
	const stop = await beginMissionExecution(trx, payload, 'outreach');
	// A method the mission plan supplied is not a new choice, so only an id
	// the payload names is gated.
	await assertWriteReferences(trx, {
		organizationId: payload.organizationId,
		write: { kind: 'create' },
		references: methodReferences('outreach', payload.outreachMethodId),
	});
	const ids = contextIds(payload.context ?? { kind: 'none' });
	const row = await trx
		.insertInto('outreach_actions')
		.values(
			await checkedValues(trx, payload.organizationId, {
				id: payload.outreachActionId,
				organization_id: payload.organizationId,
				outreach_method_id: resolveMissionMethodId(payload.outreachMethodId, stop),
				technician_profile_id: payload.technicianProfileId,
				outreach_date: localDateColumn(payload.outreachDate),
				reach: payload.reach ?? 0,
				reach_description: payload.reachDescription,
				geom: missionItemGeom(payload.missionItemId, payload.geometry),
				address_id: payload.addressId ?? null,
				inspection_id: ids.inspectionId,
				requested_control_action_id: stop.requestedControlActionId,
				mission_item_id: payload.missionItemId,
				metadata: payload.metadata,
				created_by_profile_id: payload.actorProfileId,
				updated_by_profile_id: payload.actorProfileId,
			}),
		)
		.returning(outreachActionReturnColumns)
		.executeTakeFirstOrThrow();
	await assertMissionGeometryCovered(trx, payload, payload.outreachActionId, 'outreach_actions');
	await finishMissionExecution(trx, payload, stop);
	return row;
}

async function writeMissionBiocontrolAction(
	trx: ControlOperationsTransaction,
	payload: RecordBiocontrolActionForMissionItemCommand['payload'],
): Promise<BiocontrolActionRow | null> {
	const stop = await beginMissionExecution(trx, payload, 'biocontrol');
	// A method the mission plan supplied is not a new choice, so only an id
	// the payload names is gated.
	await assertWriteReferences(trx, {
		organizationId: payload.organizationId,
		write: { kind: 'create' },
		references: methodReferences('biocontrol', payload.biocontrolMethodId),
	});
	const ids = contextIds(payload.context ?? { kind: 'none' });
	const row = await trx
		.insertInto('biocontrol_actions')
		.values(
			await checkedValues(trx, payload.organizationId, {
				id: payload.biocontrolActionId,
				organization_id: payload.organizationId,
				biocontrol_method_id: resolveMissionMethodId(payload.biocontrolMethodId, stop),
				technician_profile_id: payload.technicianProfileId,
				biocontrol_date: localDateColumn(payload.biocontrolDate),
				amount_released: payload.amountReleased,
				release_unit_id: payload.releaseUnitId,
				geom: missionItemGeom(payload.missionItemId, payload.geometry),
				address_id: payload.addressId ?? null,
				habitat_id: ids.habitatId,
				inspection_id: ids.inspectionId,
				requested_control_action_id: stop.requestedControlActionId,
				mission_item_id: payload.missionItemId,
				metadata: payload.metadata,
				created_by_profile_id: payload.actorProfileId,
				updated_by_profile_id: payload.actorProfileId,
			}),
		)
		.returning(biocontrolActionReturnColumns)
		.executeTakeFirstOrThrow();
	await assertMissionGeometryCovered(
		trx,
		payload,
		payload.biocontrolActionId,
		'biocontrol_actions',
	);
	await finishMissionExecution(trx, payload, stop);
	return row;
}

/**
 * The one catalog each performed action names: its method.
 *
 * The three action kinds differ only in the column, the catalog, and the noun.
 * Naming them once here rather than passing three strings at each of the nine
 * call sites keeps the trio from being retyped, and in an order that would
 * still compile if two of them were swapped.
 */
const ACTION_METHODS = {
	sourceReduction: {
		column: 'source_reduction_method_id',
		catalog: 'sourceReductionMethod',
		label: 'source reduction method',
	},
	outreach: {
		column: 'outreach_method_id',
		catalog: 'outreachMethod',
		label: 'outreach method',
	},
	biocontrol: {
		column: 'biocontrol_method_id',
		catalog: 'biocontrolMethod',
		label: 'biocontrol method',
	},
} as const satisfies Record<string, Omit<CatalogReference, 'id'>>;

type ActionKind = keyof typeof ACTION_METHODS;

/** The method reference for one action kind, or none when no id was named. */
function methodReferences(kind: ActionKind, id: string | null | undefined): CatalogReference[] {
	return [{ ...ACTION_METHODS[kind], id: id ?? null }];
}

export async function writeSourceReductionCommand(
	trx: ControlOperationsTransaction,
	command: ActionCommand,
): Promise<SourceReductionRow | null> {
	switch (command.type) {
		case 'controlOperations.recordSourceReduction': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'create' },
				references: methodReferences('sourceReduction', command.payload.sourceReductionMethodId),
			});
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('source_reductions')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.sourceReductionId,
						organization_id: command.payload.organizationId,
						source_reduction_method_id: command.payload.sourceReductionMethodId,
						technician_profile_id: command.payload.technicianProfileId,
						source_reduction_date: localDateColumn(command.payload.sourceReductionDate),
						geom: await resolveGeom(
							trx,
							command.payload.organizationId,
							command.payload.locationSource,
						),
						address_id: command.payload.addressId,
						habitat_id: ids.habitatId,
						sources_eliminated_amount: command.payload.sourcesEliminatedAmount,
						sources_eliminated_unit_id: command.payload.sourcesEliminatedUnitId,
						inspection_id: ids.inspectionId,
						requested_control_action_id: command.payload.requestedControlActionId,
						metadata: command.payload.metadata,
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.returning(sourceReductionReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'missionDispatch.recordSourceReductionForMissionItem':
			return writeMissionSourceReduction(trx, command.payload);
		case 'controlOperations.updateSourceReductionFieldDetails': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: {
					kind: 'update',
					table: 'source_reductions',
					recordId: command.payload.sourceReductionId,
				},
				references:
					'sourceReductionMethodId' in command.payload.changes
						? methodReferences('sourceReduction', command.payload.changes.sourceReductionMethodId)
						: [],
			});
			const changes = command.payload.changes;
			return updateActionRow(
				trx,
				'source_reductions',
				command.payload.sourceReductionId,
				command.payload.organizationId,
				{
					...('sourceReductionDate' in changes && changes.sourceReductionDate !== undefined
						? { source_reduction_date: localDateColumn(changes.sourceReductionDate) }
						: {}),
					...('technicianProfileId' in changes
						? { technician_profile_id: changes.technicianProfileId ?? null }
						: {}),
					...('sourceReductionMethodId' in changes
						? { source_reduction_method_id: changes.sourceReductionMethodId }
						: {}),
					...('sourcesEliminatedAmount' in changes
						? { sources_eliminated_amount: changes.sourcesEliminatedAmount }
						: {}),
					...('sourcesEliminatedUnitId' in changes
						? { sources_eliminated_unit_id: changes.sourcesEliminatedUnitId }
						: {}),
					...('metadata' in changes ? { metadata: changes.metadata ?? null } : {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				sourceReductionReturnColumns,
			);
		}
		case 'controlOperations.updateSourceReductionLocationAndContext':
			return updateActionRow(
				trx,
				'source_reductions',
				command.payload.sourceReductionId,
				command.payload.organizationId,
				{
					...(await locationContextColumns(
						trx,
						command.payload.organizationId,
						command.payload.changes,
						{},
					)),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				sourceReductionReturnColumns,
			);
		case 'controlOperations.deleteSourceReduction':
			await applyRecordDeletion(trx, {
				recordType: 'sourceReduction',
				recordId: command.payload.sourceReductionId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
			return softDelete(
				trx,
				'source_reductions',
				command.payload.sourceReductionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				sourceReductionReturnColumns,
			);
		default:
			throw new Error(`Unsupported source reduction command: ${command.type}`);
	}
}

// --- Outreach actions ---

export const outreachActionConfig: ActionConfig<OutreachActionRow> = {
	noun: 'outreach action',
	basePath: '/control-operations/outreach-actions',
	notFoundError: 'outreach_action_not_found',
	idParam: 'outreachActionId',
	responseKey: 'outreachAction',
	buildCreate: (ctx, p) => {
		const missionItemId = readNullableText(p.missionItemId);
		// Recorded off a mission stop: the action carries the stop and closes it.
		if (missionItemId !== null) {
			return recordOutreachActionForMissionItemCommand({
				...ctx,
				missionItemId,
				outreachActionId: readText(p.id) ?? '',
				outreachDate: readText(p.outreachDate) ?? '',
				outreachMethodId: readText(p.outreachMethodId) ?? '',
				technicianProfileId: readNullableText(p.technicianProfileId),
				reach: readNumber(p.reach) ?? 0,
				reachDescription: readNullableText(p.reachDescription),
				...(p.geometry === undefined ? {} : { geometry: p.geometry }),
				addressId: readNullableText(p.addressId),
				// The larval/adult context the record was made in is the record's own,
				// not the mission's — the form sends the same keys either way.
				context: readControlActionContext(p),
				requestedControlActionId: readNullableText(p.requestedControlActionId),
				metadata: p.metadata ?? null,
				...readMissionExecutionOptions(p),
			});
		}
		return recordOutreachActionCommand({
			...ctx,
			outreachActionId: readText(p.id) ?? '',
			outreachMethodId: readText(p.outreachMethodId) ?? '',
			technicianProfileId: readNullableText(p.technicianProfileId),
			outreachDate: readText(p.outreachDate) ?? '',
			reach: readNumber(p.reach) ?? Number.NaN,
			reachDescription: readNullableText(p.reachDescription),
			locationSource: p.locationSource as ControlActionLocationSourceInput,
			addressId: readNullableText(p.addressId),
			context: readControlActionContext(p),
			requestedControlActionId: readNullableText(p.requestedControlActionId),
			metadata: p.metadata ?? null,
		});
	},
	buildUpdate: (ctx, id, payload) => {
		const commands: ControlOperationsCommand[] = [];
		const fieldKeys = [
			'outreachDate',
			'technicianProfileId',
			'outreachMethodId',
			'reach',
			'reachDescription',
			'metadata',
		];
		if (fieldKeys.some((key) => key in payload)) {
			const result = createCommand(() =>
				updateOutreachActionFieldDetailsCommand({
					...ctx,
					outreachActionId: id,
					...('outreachDate' in payload
						? { outreachDate: readText(payload.outreachDate) ?? '' }
						: {}),
					...('technicianProfileId' in payload
						? { technicianProfileId: readNullableText(payload.technicianProfileId) }
						: {}),
					...('outreachMethodId' in payload
						? { outreachMethodId: readText(payload.outreachMethodId) ?? '' }
						: {}),
					...('reach' in payload ? { reach: readNumber(payload.reach) ?? Number.NaN } : {}),
					...('reachDescription' in payload
						? { reachDescription: readNullableText(payload.reachDescription) }
						: {}),
					...('metadata' in payload ? { metadata: payload.metadata ?? null } : {}),
				}),
			);
			if (!result.ok) {
				return result;
			}
			commands.push(result.command);
		}
		if (hasLocationContextChange(payload)) {
			const result = createCommand(() =>
				updateOutreachActionLocationAndContextCommand({
					...ctx,
					outreachActionId: id,
					...locationContextInput(payload),
				}),
			);
			if (!result.ok) {
				return result;
			}
			commands.push(result.command);
		}
		return commands.length === 0 ? invalidUpdate('outreach action') : { ok: true, commands };
	},
	buildDelete: (ctx, id) =>
		deleteOutreachActionCommand({
			...ctx,
			outreachActionId: id,
			acknowledgedSupportRecordDeletion: true,
		}),
	write: writeOutreachActionCommand,
};

export async function writeOutreachActionCommand(
	trx: ControlOperationsTransaction,
	command: ActionCommand,
): Promise<OutreachActionRow | null> {
	switch (command.type) {
		case 'controlOperations.recordOutreachAction': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'create' },
				references: methodReferences('outreach', command.payload.outreachMethodId),
			});
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('outreach_actions')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.outreachActionId,
						organization_id: command.payload.organizationId,
						outreach_method_id: command.payload.outreachMethodId,
						technician_profile_id: command.payload.technicianProfileId,
						outreach_date: localDateColumn(command.payload.outreachDate),
						geom: await resolveGeom(
							trx,
							command.payload.organizationId,
							command.payload.locationSource,
						),
						address_id: command.payload.addressId,
						inspection_id: ids.inspectionId,
						reach: command.payload.reach,
						reach_description: command.payload.reachDescription,
						requested_control_action_id: command.payload.requestedControlActionId,
						metadata: command.payload.metadata,
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.returning(outreachActionReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'missionDispatch.recordOutreachActionForMissionItem':
			return writeMissionOutreachAction(trx, command.payload);
		case 'controlOperations.updateOutreachActionFieldDetails': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: {
					kind: 'update',
					table: 'outreach_actions',
					recordId: command.payload.outreachActionId,
				},
				references:
					'outreachMethodId' in command.payload.changes
						? methodReferences('outreach', command.payload.changes.outreachMethodId)
						: [],
			});
			const changes = command.payload.changes;
			return updateActionRow(
				trx,
				'outreach_actions',
				command.payload.outreachActionId,
				command.payload.organizationId,
				{
					...('outreachDate' in changes && changes.outreachDate !== undefined
						? { outreach_date: localDateColumn(changes.outreachDate) }
						: {}),
					...('technicianProfileId' in changes
						? { technician_profile_id: changes.technicianProfileId ?? null }
						: {}),
					...('outreachMethodId' in changes
						? { outreach_method_id: changes.outreachMethodId }
						: {}),
					...('reach' in changes ? { reach: changes.reach } : {}),
					...('reachDescription' in changes
						? { reach_description: changes.reachDescription ?? null }
						: {}),
					...('metadata' in changes ? { metadata: changes.metadata ?? null } : {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				outreachActionReturnColumns,
			);
		}
		case 'controlOperations.updateOutreachActionLocationAndContext':
			return updateActionRow(
				trx,
				'outreach_actions',
				command.payload.outreachActionId,
				command.payload.organizationId,
				{
					...(await locationContextColumns(
						trx,
						command.payload.organizationId,
						command.payload.changes,
						{ habitat: false },
					)),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				outreachActionReturnColumns,
			);
		case 'controlOperations.deleteOutreachAction':
			await applyRecordDeletion(trx, {
				recordType: 'outreachAction',
				recordId: command.payload.outreachActionId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
			return softDelete(
				trx,
				'outreach_actions',
				command.payload.outreachActionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				outreachActionReturnColumns,
			);
		default:
			throw new Error(`Unsupported outreach action command: ${command.type}`);
	}
}

// --- Biocontrol actions ---

export const biocontrolActionConfig: ActionConfig<BiocontrolActionRow> = {
	noun: 'biocontrol action',
	basePath: '/control-operations/biocontrol-actions',
	notFoundError: 'biocontrol_action_not_found',
	idParam: 'biocontrolActionId',
	responseKey: 'biocontrolAction',
	buildCreate: (ctx, p) => {
		const missionItemId = readNullableText(p.missionItemId);
		// Recorded off a mission stop: the action carries the stop and closes it.
		if (missionItemId !== null) {
			return recordBiocontrolActionForMissionItemCommand({
				...ctx,
				missionItemId,
				biocontrolActionId: readText(p.id) ?? '',
				biocontrolDate: readText(p.biocontrolDate) ?? '',
				amountReleased: readNumber(p.amountReleased) ?? Number.NaN,
				releaseUnitId: readText(p.releaseUnitId) ?? '',
				biocontrolMethodId: readText(p.biocontrolMethodId) ?? '',
				technicianProfileId: readNullableText(p.technicianProfileId),
				...(p.geometry === undefined ? {} : { geometry: p.geometry }),
				addressId: readNullableText(p.addressId),
				// The larval/adult context the record was made in is the record's own,
				// not the mission's — the form sends the same keys either way.
				context: readControlActionContext(p),
				requestedControlActionId: readNullableText(p.requestedControlActionId),
				metadata: p.metadata ?? null,
				...readMissionExecutionOptions(p),
			});
		}
		return recordBiocontrolActionCommand({
			...ctx,
			biocontrolActionId: readText(p.id) ?? '',
			biocontrolMethodId: readText(p.biocontrolMethodId) ?? '',
			technicianProfileId: readNullableText(p.technicianProfileId),
			biocontrolDate: readText(p.biocontrolDate) ?? '',
			amountReleased: readNumber(p.amountReleased) ?? Number.NaN,
			releaseUnitId: readText(p.releaseUnitId) ?? '',
			locationSource: p.locationSource as ControlActionLocationSourceInput,
			addressId: readNullableText(p.addressId),
			context: readControlActionContext(p),
			requestedControlActionId: readNullableText(p.requestedControlActionId),
			metadata: p.metadata ?? null,
		});
	},
	buildUpdate: (ctx, id, payload) => {
		const commands: ControlOperationsCommand[] = [];
		const fieldKeys = [
			'biocontrolDate',
			'technicianProfileId',
			'biocontrolMethodId',
			'amountReleased',
			'releaseUnitId',
			'metadata',
		];
		if (fieldKeys.some((key) => key in payload)) {
			const result = createCommand(() =>
				updateBiocontrolActionFieldDetailsCommand({
					...ctx,
					biocontrolActionId: id,
					...('biocontrolDate' in payload
						? { biocontrolDate: readText(payload.biocontrolDate) ?? '' }
						: {}),
					...('technicianProfileId' in payload
						? { technicianProfileId: readNullableText(payload.technicianProfileId) }
						: {}),
					...('biocontrolMethodId' in payload
						? { biocontrolMethodId: readText(payload.biocontrolMethodId) ?? '' }
						: {}),
					...('amountReleased' in payload
						? { amountReleased: readNumber(payload.amountReleased) ?? Number.NaN }
						: {}),
					...('releaseUnitId' in payload
						? { releaseUnitId: readText(payload.releaseUnitId) ?? '' }
						: {}),
					...('metadata' in payload ? { metadata: payload.metadata ?? null } : {}),
				}),
			);
			if (!result.ok) {
				return result;
			}
			commands.push(result.command);
		}
		if (hasLocationContextChange(payload)) {
			const result = createCommand(() =>
				updateBiocontrolActionLocationAndContextCommand({
					...ctx,
					biocontrolActionId: id,
					...locationContextInput(payload),
				}),
			);
			if (!result.ok) {
				return result;
			}
			commands.push(result.command);
		}
		return commands.length === 0 ? invalidUpdate('biocontrol action') : { ok: true, commands };
	},
	buildDelete: (ctx, id) =>
		deleteBiocontrolActionCommand({
			...ctx,
			biocontrolActionId: id,
			acknowledgedSupportRecordDeletion: true,
		}),
	write: writeBiocontrolActionCommand,
};

export async function writeBiocontrolActionCommand(
	trx: ControlOperationsTransaction,
	command: ActionCommand,
): Promise<BiocontrolActionRow | null> {
	switch (command.type) {
		case 'controlOperations.recordBiocontrolAction': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'create' },
				references: methodReferences('biocontrol', command.payload.biocontrolMethodId),
			});
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('biocontrol_actions')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.biocontrolActionId,
						organization_id: command.payload.organizationId,
						biocontrol_method_id: command.payload.biocontrolMethodId,
						technician_profile_id: command.payload.technicianProfileId,
						biocontrol_date: localDateColumn(command.payload.biocontrolDate),
						geom: await resolveGeom(
							trx,
							command.payload.organizationId,
							command.payload.locationSource,
						),
						address_id: command.payload.addressId,
						habitat_id: ids.habitatId,
						inspection_id: ids.inspectionId,
						amount_released: command.payload.amountReleased,
						release_unit_id: command.payload.releaseUnitId,
						requested_control_action_id: command.payload.requestedControlActionId,
						metadata: command.payload.metadata,
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.returning(biocontrolActionReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'missionDispatch.recordBiocontrolActionForMissionItem':
			return writeMissionBiocontrolAction(trx, command.payload);
		case 'controlOperations.updateBiocontrolActionFieldDetails': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: {
					kind: 'update',
					table: 'biocontrol_actions',
					recordId: command.payload.biocontrolActionId,
				},
				references:
					'biocontrolMethodId' in command.payload.changes
						? methodReferences('biocontrol', command.payload.changes.biocontrolMethodId)
						: [],
			});
			const changes = command.payload.changes;
			return updateActionRow(
				trx,
				'biocontrol_actions',
				command.payload.biocontrolActionId,
				command.payload.organizationId,
				{
					...('biocontrolDate' in changes && changes.biocontrolDate !== undefined
						? { biocontrol_date: localDateColumn(changes.biocontrolDate) }
						: {}),
					...('technicianProfileId' in changes
						? { technician_profile_id: changes.technicianProfileId ?? null }
						: {}),
					...('biocontrolMethodId' in changes
						? { biocontrol_method_id: changes.biocontrolMethodId }
						: {}),
					...('amountReleased' in changes ? { amount_released: changes.amountReleased } : {}),
					...('releaseUnitId' in changes ? { release_unit_id: changes.releaseUnitId } : {}),
					...('metadata' in changes ? { metadata: changes.metadata ?? null } : {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				biocontrolActionReturnColumns,
			);
		}
		case 'controlOperations.updateBiocontrolActionLocationAndContext':
			return updateActionRow(
				trx,
				'biocontrol_actions',
				command.payload.biocontrolActionId,
				command.payload.organizationId,
				{
					...(await locationContextColumns(
						trx,
						command.payload.organizationId,
						command.payload.changes,
						{},
					)),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				biocontrolActionReturnColumns,
			);
		case 'controlOperations.deleteBiocontrolAction':
			await applyRecordDeletion(trx, {
				recordType: 'biocontrolAction',
				recordId: command.payload.biocontrolActionId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
			return softDelete(
				trx,
				'biocontrol_actions',
				command.payload.biocontrolActionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				biocontrolActionReturnColumns,
			);
		default:
			throw new Error(`Unsupported biocontrol action command: ${command.type}`);
	}
}

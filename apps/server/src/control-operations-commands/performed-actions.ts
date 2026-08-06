import { applyRecordDeletion, type MutationWriteResult } from '@simmer-mosquito/db';
import {
	type ControlActionLocationSourceInput,
	type ControlOperationsCommand,
	deleteBiocontrolActionCommand,
	deleteOutreachActionCommand,
	deleteSourceReductionCommand,
	recordBiocontrolActionCommand,
	recordOutreachActionCommand,
	recordSourceReductionCommand,
	updateBiocontrolActionFieldDetailsCommand,
	updateBiocontrolActionLocationAndContextCommand,
	updateOutreachActionFieldDetailsCommand,
	updateOutreachActionLocationAndContextCommand,
	updateSourceReductionFieldDetailsCommand,
	updateSourceReductionLocationAndContextCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { readNullableText, readNumber, readText } from '../command-payload.js';
import { type CommandActor, denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	type AgencyContext,
	biocontrolActionReturnColumns,
	type CommandContext,
	type CommandsResult,
	type ControlOperationsDb,
	type ControlOperationsTransaction,
	commandActor,
	commandEndpoint,
	contextIds,
	createCommand,
	handleCommandError,
	hasLocationContextChange,
	invalidUpdate,
	localDateColumn,
	locationContextColumns,
	locationContextInput,
	outreachActionReturnColumns,
	type RouteOptions,
	readControlActionContext,
	resolveGeom,
	type SafeBiocontrolAction,
	type SafeOutreachAction,
	type SafeSourceReduction,
	softDelete,
	sourceReductionReturnColumns,
	toSafeBiocontrolAction,
	toSafeOutreachAction,
	toSafeSourceReduction,
	updateActionRow,
	writeActionCommands,
} from './shared.js';

// ===========================================================================
// Source reduction / outreach / biocontrol actions (shared shape)
// ===========================================================================

interface ActionConfig<TSafe> {
	readonly noun: string;
	readonly basePath: string;
	readonly notFoundError: string;
	readonly idParam: string;
	readonly buildCreate: (
		ctx: AgencyContext,
		payload: Record<string, unknown>,
	) => ControlOperationsCommand;
	readonly buildUpdate: (
		ctx: AgencyContext,
		id: string,
		payload: Record<string, unknown>,
	) => CommandsResult;
	readonly buildDelete: (ctx: AgencyContext, id: string) => ControlOperationsCommand;
	readonly write: (
		db: ControlOperationsDb,
		actor: CommandActor,
		commands: readonly ControlOperationsCommand[],
	) => Promise<MutationWriteResult<TSafe | null>>;
	readonly responseKey: string;
}

export function registerActionRoutes<TSafe>(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
	config: ActionConfig<TSafe>,
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

async function runActionCommands<TSafe>(
	context: CommandContext,
	db: ControlOperationsDb,
	config: ActionConfig<TSafe>,
	commands: readonly ControlOperationsCommand[],
	createdStatus?: 201,
) {
	const denial = denyUnauthorizedAgencyCommands(context, commands);
	if (denial !== null) {
		return denial;
	}

	try {
		const result = await config.write(db, commandActor(context.get('authContext')), commands);
		if (result.row === null) {
			return context.json({ error: config.notFoundError }, 404);
		}
		return context.json(
			{ [config.responseKey]: result.row, txid: result.txid },
			createdStatus ?? 200,
		);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

// --- Source reductions ---

export const sourceReductionConfig: ActionConfig<SafeSourceReduction> = {
	noun: 'source reduction',
	basePath: '/control-operations/source-reductions',
	notFoundError: 'source_reduction_not_found',
	idParam: 'sourceReductionId',
	responseKey: 'sourceReduction',
	buildCreate: (ctx, p) =>
		recordSourceReductionCommand({
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
		}),
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
	write: (db, actor, commands) =>
		writeActionCommands(db, actor, commands, writeSourceReductionCommand),
};

async function writeSourceReductionCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<SafeSourceReduction | null> {
	switch (command.type) {
		case 'controlOperations.recordSourceReduction': {
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('source_reductions')
				.values({
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
				})
				.returning(sourceReductionReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeSourceReduction(row);
		}
		case 'controlOperations.updateSourceReductionFieldDetails': {
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
				toSafeSourceReduction,
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
				toSafeSourceReduction,
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
				toSafeSourceReduction,
			);
		default:
			throw new Error(`Unsupported source reduction command: ${command.type}`);
	}
}

// --- Outreach actions ---

export const outreachActionConfig: ActionConfig<SafeOutreachAction> = {
	noun: 'outreach action',
	basePath: '/control-operations/outreach-actions',
	notFoundError: 'outreach_action_not_found',
	idParam: 'outreachActionId',
	responseKey: 'outreachAction',
	buildCreate: (ctx, p) =>
		recordOutreachActionCommand({
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
		}),
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
	write: (db, actor, commands) =>
		writeActionCommands(db, actor, commands, writeOutreachActionCommand),
};

async function writeOutreachActionCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<SafeOutreachAction | null> {
	switch (command.type) {
		case 'controlOperations.recordOutreachAction': {
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('outreach_actions')
				.values({
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
				})
				.returning(outreachActionReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeOutreachAction(row);
		}
		case 'controlOperations.updateOutreachActionFieldDetails': {
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
				toSafeOutreachAction,
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
				toSafeOutreachAction,
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
				toSafeOutreachAction,
			);
		default:
			throw new Error(`Unsupported outreach action command: ${command.type}`);
	}
}

// --- Biocontrol actions ---

export const biocontrolActionConfig: ActionConfig<SafeBiocontrolAction> = {
	noun: 'biocontrol action',
	basePath: '/control-operations/biocontrol-actions',
	notFoundError: 'biocontrol_action_not_found',
	idParam: 'biocontrolActionId',
	responseKey: 'biocontrolAction',
	buildCreate: (ctx, p) =>
		recordBiocontrolActionCommand({
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
		}),
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
	write: (db, actor, commands) =>
		writeActionCommands(db, actor, commands, writeBiocontrolActionCommand),
};

async function writeBiocontrolActionCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<SafeBiocontrolAction | null> {
	switch (command.type) {
		case 'controlOperations.recordBiocontrolAction': {
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('biocontrol_actions')
				.values({
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
				})
				.returning(biocontrolActionReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeBiocontrolAction(row);
		}
		case 'controlOperations.updateBiocontrolActionFieldDetails': {
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
				toSafeBiocontrolAction,
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
				toSafeBiocontrolAction,
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
				toSafeBiocontrolAction,
			);
		default:
			throw new Error(`Unsupported biocontrol action command: ${command.type}`);
	}
}

import { applyRecordDeletion, sql } from '@simmer-mosquito/db';
import {
	type ControlOperationsCommand,
	deleteRequestedControlActionCommand,
	type RequestedControlActionLocationSourceInput,
	reopenRequestedControlActionCommand,
	requestControlActionCommand,
	resolveRequestedControlActionCommand,
	updateRequestedControlActionDetailsCommand,
	updateRequestedControlActionLocationAndContextCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import { readNullableText, readText } from '../command-payload.js';
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import {
	agencyCommandContext,
	type CommandContext,
	type CommandsResult,
	type ControlOperationsDb,
	type ControlOperationsTransaction,
	commandActor,
	contextIds,
	createCommand,
	handleCommandError,
	invalidUpdate,
	locationContextColumns,
	type RouteOptions,
	readControlActionContext,
	readDate,
	readJsonObject,
	requestedControlActionReturnColumns,
	resolveGeom,
	type SafeRequestedControlAction,
	softDelete,
	toSafeRequestedControlAction,
	updateActionRow,
	writeActionCommands,
} from './shared.js';

// ===========================================================================
// Requested control actions
// ===========================================================================

export function registerRequestedControlActionRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/control-operations/requested-control-actions',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const p = raw.payload;
			const result = createCommand(() =>
				requestControlActionCommand({
					...ctx,
					requestedControlActionId: readText(p.id) ?? '',
					controlType: (readText(p.controlType) ?? '') as never,
					locationSource: p.locationSource as RequestedControlActionLocationSourceInput,
					addressId: readNullableText(p.addressId),
					context: readControlActionContext(p),
					recommendedMethodId: readNullableText(p.recommendedMethodId),
					summary: readNullableText(p.summary),
					requestedByProfileId: readNullableText(p.requestedByProfileId),
					requestedAt: readDate(p.requestedAt),
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runRequestedControlActionCommands(context, options.db, [result.command], 201);
		},
	);

	app.patch(
		'/control-operations/requested-control-actions/:requestedControlActionId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const commandsResult = buildRequestedControlActionUpdateCommands(
				context.get('authContext'),
				context.req.param('requestedControlActionId'),
				raw.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}
			return runRequestedControlActionCommands(context, options.db, commandsResult.commands);
		},
	);

	app.delete(
		'/control-operations/requested-control-actions/:requestedControlActionId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				deleteRequestedControlActionCommand({
					...ctx,
					requestedControlActionId: context.req.param('requestedControlActionId'),
					acknowledgedActionDetach: true,
					acknowledgedMissionDetach: true,
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runRequestedControlActionCommands(context, options.db, [result.command]);
		},
	);
}

function buildRequestedControlActionUpdateCommands(
	authContext: AuthContext,
	requestedControlActionId: string,
	payload: Record<string, unknown>,
): CommandsResult {
	const ctx = agencyCommandContext(authContext);
	const commands: ControlOperationsCommand[] = [];

	const fieldKeys = [
		'controlType',
		'recommendedMethodId',
		'summary',
		'requestedByProfileId',
		'requestedAt',
	];
	if (fieldKeys.some((key) => key in payload)) {
		const result = createCommand(() =>
			updateRequestedControlActionDetailsCommand({
				...ctx,
				requestedControlActionId,
				...('controlType' in payload
					? { controlType: (readText(payload.controlType) ?? '') as never }
					: {}),
				...('recommendedMethodId' in payload
					? { recommendedMethodId: readNullableText(payload.recommendedMethodId) }
					: {}),
				...('summary' in payload ? { summary: readNullableText(payload.summary) } : {}),
				...('requestedByProfileId' in payload
					? { requestedByProfileId: readNullableText(payload.requestedByProfileId) }
					: {}),
				...('requestedAt' in payload ? { requestedAt: readDate(payload.requestedAt) } : {}),
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	const hasLocation = 'locationSource' in payload;
	const hasAddress = 'addressId' in payload;
	const hasContext = 'context' in payload;
	if (hasLocation || hasAddress || hasContext) {
		const result = createCommand(() =>
			updateRequestedControlActionLocationAndContextCommand({
				...ctx,
				requestedControlActionId,
				...(hasLocation
					? { locationSource: payload.locationSource as RequestedControlActionLocationSourceInput }
					: {}),
				...(hasAddress ? { addressId: readNullableText(payload.addressId) } : {}),
				...(hasContext ? { context: readControlActionContext(payload) } : {}),
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if ('resolvedAt' in payload || typeof payload.isResolved === 'boolean') {
		const resolved = payload.isResolved !== false && payload.resolvedAt !== null;
		const result = createCommand(() =>
			resolved
				? resolveRequestedControlActionCommand({
						...ctx,
						requestedControlActionId,
						resolvedAt: readDate(payload.resolvedAt),
					})
				: reopenRequestedControlActionCommand({ ...ctx, requestedControlActionId }),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('requested control action');
	}
	return { ok: true, commands };
}

async function runRequestedControlActionCommands(
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
		const result = await writeActionCommands(
			db,
			commandActor(context.get('authContext')),
			commands,
			writeRequestedControlActionCommand,
		);
		if (result.row === null) {
			return context.json({ error: 'requested_control_action_not_found' }, 404);
		}
		return context.json(
			{ requestedControlAction: result.row, txid: result.txid },
			createdStatus ?? 200,
		);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeRequestedControlActionCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<SafeRequestedControlAction | null> {
	switch (command.type) {
		case 'controlOperations.requestControlAction': {
			const ids = contextIds(command.payload.context);
			const row = await trx
				.insertInto('requested_control_actions')
				.values({
					id: command.payload.requestedControlActionId,
					organization_id: command.payload.organizationId,
					control_type: command.payload.controlType,
					recommended_method_id: command.payload.recommendedMethodId,
					summary: command.payload.summary,
					habitat_id: ids.habitatId,
					inspection_id: ids.inspectionId,
					collection_id: ids.collectionId,
					geom: await resolveGeom(
						trx,
						command.payload.organizationId,
						command.payload.locationSource,
					),
					address_id: command.payload.addressId,
					requested_by_profile_id: command.payload.requestedByProfileId,
					...(command.payload.requestedAt === null
						? {}
						: { requested_at: command.payload.requestedAt }),
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(requestedControlActionReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeRequestedControlAction(row);
		}
		case 'controlOperations.updateRequestedControlActionDetails': {
			const changes = command.payload.changes;
			return updateActionRow(
				trx,
				'requested_control_actions',
				command.payload.requestedControlActionId,
				command.payload.organizationId,
				{
					...('controlType' in changes ? { control_type: changes.controlType } : {}),
					...('recommendedMethodId' in changes
						? { recommended_method_id: changes.recommendedMethodId ?? null }
						: {}),
					...('summary' in changes ? { summary: changes.summary ?? null } : {}),
					...('requestedByProfileId' in changes
						? { requested_by_profile_id: changes.requestedByProfileId ?? null }
						: {}),
					...('requestedAt' in changes && changes.requestedAt !== undefined
						? { requested_at: changes.requestedAt === null ? sql`now()` : changes.requestedAt }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				requestedControlActionReturnColumns,
				toSafeRequestedControlAction,
			);
		}
		case 'controlOperations.updateRequestedControlActionLocationAndContext':
			return updateActionRow(
				trx,
				'requested_control_actions',
				command.payload.requestedControlActionId,
				command.payload.organizationId,
				{
					...(await locationContextColumns(
						trx,
						command.payload.organizationId,
						command.payload.changes,
						{ collection: true },
					)),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				requestedControlActionReturnColumns,
				toSafeRequestedControlAction,
			);
		case 'controlOperations.resolveRequestedControlAction':
			return updateActionRow(
				trx,
				'requested_control_actions',
				command.payload.requestedControlActionId,
				command.payload.organizationId,
				{
					resolved_at:
						command.payload.resolvedAt === null ? sql`now()` : command.payload.resolvedAt,
					resolved_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				requestedControlActionReturnColumns,
				toSafeRequestedControlAction,
			);
		case 'controlOperations.reopenRequestedControlAction':
			return updateActionRow(
				trx,
				'requested_control_actions',
				command.payload.requestedControlActionId,
				command.payload.organizationId,
				{
					resolved_at: null,
					resolved_by_profile_id: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				requestedControlActionReturnColumns,
				toSafeRequestedControlAction,
			);
		case 'controlOperations.deleteRequestedControlAction':
			await applyRecordDeletion(trx, {
				recordType: 'requestedControlAction',
				recordId: command.payload.requestedControlActionId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
			return softDelete(
				trx,
				'requested_control_actions',
				command.payload.requestedControlActionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				requestedControlActionReturnColumns,
				toSafeRequestedControlAction,
			);
		default:
			throw new Error(`Unsupported requested control action command: ${command.type}`);
	}
}

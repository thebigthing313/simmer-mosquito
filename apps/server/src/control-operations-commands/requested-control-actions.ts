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
import {
	agencyCommandContext,
	type CommandContext,
	type CommandsResult,
	type ControlOperationsDb,
	type ControlOperationsTransaction,
	commandEndpoint,
	contextIds,
	createCommand,
	hasLocationContextChange,
	invalidUpdate,
	locationContextColumns,
	locationContextInput,
	type RequestedControlActionRow,
	type RouteOptions,
	readControlActionContext,
	readDate,
	requestedControlActionReturnColumns,
	resolveGeom,
	runCommands,
	softDelete,
	updateActionRow,
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
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				requestControlActionCommand({
					...ctx,
					requestedControlActionId: readText(payload.id) ?? '',
					controlType: (readText(payload.controlType) ?? '') as never,
					locationSource: payload.locationSource as RequestedControlActionLocationSourceInput,
					addressId: readNullableText(payload.addressId),
					context: readControlActionContext(payload),
					recommendedMethodId: readNullableText(payload.recommendedMethodId),
					summary: readNullableText(payload.summary),
					requestedByProfileId: readNullableText(payload.requestedByProfileId),
					requestedAt: readDate(payload.requestedAt),
				}),
			run: (context, commands) =>
				runRequestedControlActionCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/control-operations/requested-control-actions/:requestedControlActionId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, authContext, param }) =>
				buildRequestedControlActionUpdateCommands(
					authContext,
					param('requestedControlActionId'),
					payload,
				),
			run: (context, commands) => runRequestedControlActionCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/control-operations/requested-control-actions/:requestedControlActionId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				deleteRequestedControlActionCommand({
					...ctx,
					requestedControlActionId: param('requestedControlActionId'),
					acknowledgedActionDetach: true,
					acknowledgedMissionDetach: true,
				}),
			run: (context, commands) => runRequestedControlActionCommands(context, options.db, commands),
		}),
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

	// The flat `habitatId`/`inspectionId`/`collectionId` keys count as a context
	// change, not just a nested `context` object — that is the shape the client
	// collections actually PATCH, and reading only the nested form meant an edit
	// that moved a request to a different habitat and nothing else built no
	// command at all and came back as an invalid update.
	if (hasLocationContextChange(payload)) {
		const input = locationContextInput(payload);
		const result = createCommand(() =>
			updateRequestedControlActionLocationAndContextCommand({
				...ctx,
				requestedControlActionId,
				...('locationSource' in payload
					? {
							locationSource: payload.locationSource as RequestedControlActionLocationSourceInput,
						}
					: {}),
				...(input.addressId === undefined ? {} : { addressId: input.addressId }),
				...(input.context === undefined ? {} : { context: input.context }),
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
	return runCommands(
		context,
		{
			db,
			write: writeRequestedControlActionCommand,
			notFound: 'requested_control_action_not_found',
			key: 'requestedControlAction',
		},
		commands,
		createdStatus,
	);
}

export async function writeRequestedControlActionCommand(
	trx: ControlOperationsTransaction,
	command: ControlOperationsCommand,
): Promise<RequestedControlActionRow | null> {
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
			return row;
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
			);
		default:
			throw new Error(`Unsupported requested control action command: ${command.type}`);
	}
}

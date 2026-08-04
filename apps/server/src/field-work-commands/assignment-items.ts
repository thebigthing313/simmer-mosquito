import { sql } from '@simmer-mosquito/db';
import {
	type AssignmentItemPlacement,
	type AssignmentItemTarget,
	addAssignmentItemCommand,
	completeAssignmentItemCommand,
	type FieldWorkCommand,
	removeAssignmentItemCommand,
	reopenAssignmentItemCommand,
	skipAssignmentItemCommand,
	toDbEntityType,
	unskipAssignmentItemCommand,
	updateAssignmentItemCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import { assertItemProgress } from './assignment-lifecycle.js';
import {
	agencyCommandContext,
	applyPlacement,
	assertAssignmentItemAssignee,
	assignmentItemReturnColumns,
	assignmentPlacementRef,
	type CommandActor,
	type CommandContext,
	type CommandsResult,
	commandActor,
	createCommand,
	denyUnauthorizedCommands,
	type FieldWorkDb,
	type FieldWorkTransaction,
	handleCommandError,
	invalidUpdate,
	type RouteOptions,
	readDate,
	readItemLifecycleTransition,
	readJsonObject,
	readNullableText,
	readTarget,
	readText,
	reindexItems,
	type SafeAssignmentItem,
	softDelete,
	toSafeAssignmentItem,
	updateRow,
	writeCommands,
} from './shared.js';

// ===========================================================================
// Assignment items
// ===========================================================================

export function registerAssignmentItemRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/field-work/assignment-items', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			addAssignmentItemCommand({
				...ctx,
				assignmentItemId: readText(raw.payload.id) ?? '',
				assignmentId: readText(raw.payload.assignmentId) ?? '',
				target: readTarget(raw.payload) as AssignmentItemTarget,
				...(raw.payload.placement === undefined
					? {}
					: { placement: raw.payload.placement as AssignmentItemPlacement }),
				directionsToNextItem: readNullableText(raw.payload.directionsToNextItem),
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runAssignmentItemCommands(context, options.db, [result.command], 201);
	});

	app.patch(
		'/field-work/assignment-items/:assignmentItemId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const commandsResult = buildAssignmentItemUpdateCommands(
				context.get('authContext'),
				context.req.param('assignmentItemId'),
				raw.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}
			return runAssignmentItemCommands(context, options.db, commandsResult.commands);
		},
	);

	app.delete(
		'/field-work/assignment-items/:assignmentItemId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				removeAssignmentItemCommand({
					...ctx,
					assignmentItemId: context.req.param('assignmentItemId'),
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runAssignmentItemCommands(context, options.db, [result.command]);
		},
	);
}

function buildAssignmentItemUpdateCommands(
	authContext: AuthContext,
	assignmentItemId: string,
	payload: Record<string, unknown>,
): CommandsResult {
	const ctx = agencyCommandContext(authContext);
	const commands: FieldWorkCommand[] = [];

	if ('directionsToNextItem' in payload) {
		const result = createCommand(() =>
			updateAssignmentItemCommand({
				...ctx,
				assignmentItemId,
				directionsToNextItem: readNullableText(payload.directionsToNextItem),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	const lifecycle = readItemLifecycleTransition(payload);
	if (lifecycle === 'skip') {
		const result = createCommand(() =>
			skipAssignmentItemCommand({
				...ctx,
				assignmentItemId,
				skippedAt: readDate(payload.skippedAt),
				skipReason: readText(payload.skipReason) ?? '',
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	} else if (lifecycle === 'complete') {
		const result = createCommand(() =>
			completeAssignmentItemCommand({
				...ctx,
				assignmentItemId,
				completedAt: readDate(payload.completedAt),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	} else if (lifecycle === 'unskip') {
		const result = createCommand(() => unskipAssignmentItemCommand({ ...ctx, assignmentItemId }));
		if (!result.ok) return result;
		commands.push(result.command);
	} else if (lifecycle === 'reopen') {
		const result = createCommand(() => reopenAssignmentItemCommand({ ...ctx, assignmentItemId }));
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('assignment item');
	}
	return { ok: true, commands };
}

async function runAssignmentItemCommands(
	context: CommandContext,
	db: FieldWorkDb,
	commands: readonly FieldWorkCommand[],
	createdStatus?: 201,
) {
	const denial = denyUnauthorizedCommands(context, commands);
	if (denial !== null) {
		return denial;
	}

	const actor = commandActor(context.get('authContext'));
	try {
		const result = await writeCommands(db, commands, (trx, command) =>
			writeAssignmentItemCommand(trx, command, actor),
		);
		if (result.row === null) {
			return context.json({ error: 'assignment_item_not_found' }, 404);
		}
		return context.json({ assignmentItem: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeAssignmentItemCommand(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
	actor: CommandActor,
): Promise<SafeAssignmentItem | null> {
	switch (command.type) {
		case 'fieldWork.addAssignmentItem': {
			await trx
				.insertInto('assignment_items')
				.values({
					id: command.payload.assignmentItemId,
					organization_id: command.payload.organizationId,
					assignment_id: command.payload.assignmentId,
					entity_type: toDbEntityType(command.payload.target.type),
					entity_id: command.payload.target.id,
					position: 0,
					directions_to_next_item: command.payload.directionsToNextItem,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.execute();
			await reindexItems(
				trx,
				'assignment_items',
				'assignment_id',
				command.payload.assignmentId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				(ids) =>
					applyPlacement(
						ids,
						[command.payload.assignmentItemId],
						command.payload.placement.kind,
						assignmentPlacementRef(command.payload.placement),
					),
			);
			return loadAssignmentItem(
				trx,
				command.payload.assignmentItemId,
				command.payload.organizationId,
			);
		}
		case 'fieldWork.updateAssignmentItem':
			return updateRow(
				trx,
				'assignment_items',
				command.payload.assignmentItemId,
				command.payload.organizationId,
				{
					...('directionsToNextItem' in command.payload.changes
						? { directions_to_next_item: command.payload.changes.directionsToNextItem ?? null }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				assignmentItemReturnColumns,
				toSafeAssignmentItem,
			);
		case 'fieldWork.completeAssignmentItem':
			await assertAssignmentItemAssignee(
				trx,
				command.payload.assignmentItemId,
				command.payload.organizationId,
				actor,
			);
			await assertItemProgress(
				trx,
				command.payload.assignmentItemId,
				command.payload.organizationId,
				'complete',
			);
			return updateRow(
				trx,
				'assignment_items',
				command.payload.assignmentItemId,
				command.payload.organizationId,
				{
					completed_at:
						command.payload.completedAt === null ? sql`now()` : command.payload.completedAt,
					completed_by_profile_id: command.payload.actorProfileId,
					skipped_at: null,
					skipped_by_profile_id: null,
					skip_reason: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				assignmentItemReturnColumns,
				toSafeAssignmentItem,
			);
		case 'fieldWork.reopenAssignmentItem':
			await assertAssignmentItemAssignee(
				trx,
				command.payload.assignmentItemId,
				command.payload.organizationId,
				actor,
			);
			await assertItemProgress(
				trx,
				command.payload.assignmentItemId,
				command.payload.organizationId,
				'reopen',
			);
			return updateRow(
				trx,
				'assignment_items',
				command.payload.assignmentItemId,
				command.payload.organizationId,
				{
					completed_at: null,
					completed_by_profile_id: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				assignmentItemReturnColumns,
				toSafeAssignmentItem,
			);
		case 'fieldWork.skipAssignmentItem':
			await assertAssignmentItemAssignee(
				trx,
				command.payload.assignmentItemId,
				command.payload.organizationId,
				actor,
			);
			await assertItemProgress(
				trx,
				command.payload.assignmentItemId,
				command.payload.organizationId,
				'skip',
			);
			return updateRow(
				trx,
				'assignment_items',
				command.payload.assignmentItemId,
				command.payload.organizationId,
				{
					skipped_at: command.payload.skippedAt === null ? sql`now()` : command.payload.skippedAt,
					skipped_by_profile_id: command.payload.actorProfileId,
					skip_reason: command.payload.skipReason,
					completed_at: null,
					completed_by_profile_id: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				assignmentItemReturnColumns,
				toSafeAssignmentItem,
			);
		case 'fieldWork.unskipAssignmentItem':
			await assertAssignmentItemAssignee(
				trx,
				command.payload.assignmentItemId,
				command.payload.organizationId,
				actor,
			);
			await assertItemProgress(
				trx,
				command.payload.assignmentItemId,
				command.payload.organizationId,
				'unskip',
			);
			return updateRow(
				trx,
				'assignment_items',
				command.payload.assignmentItemId,
				command.payload.organizationId,
				{
					skipped_at: null,
					skipped_by_profile_id: null,
					skip_reason: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				assignmentItemReturnColumns,
				toSafeAssignmentItem,
			);
		case 'fieldWork.removeAssignmentItem':
			return softDelete(
				trx,
				'assignment_items',
				command.payload.assignmentItemId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				assignmentItemReturnColumns,
				toSafeAssignmentItem,
			);
		default:
			throw new Error(`Unsupported assignment item command: ${command.type}`);
	}
}

async function loadAssignmentItem(
	trx: FieldWorkTransaction,
	assignmentItemId: string,
	organizationId: string,
): Promise<SafeAssignmentItem | null> {
	const row = await trx
		.selectFrom('assignment_items')
		.select(assignmentItemReturnColumns)
		.where('id', '=', assignmentItemId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row === undefined ? null : toSafeAssignmentItem(row);
}

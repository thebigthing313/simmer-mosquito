import { sql } from '@simmer-mosquito/db';
import {
	type AssignmentItemPlacement,
	cancelAssignmentCommand,
	completeAssignmentCommand,
	createAssignmentCommand,
	createAssignmentFromRouteCommand,
	deleteAssignmentCommand,
	type FieldWorkCommand,
	moveAssignmentItemsCommand,
	reopenAssignmentCommand,
	selfAssignRouteCommand,
	startAssignmentCommand,
	updateAssignmentDetailsCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import {
	agencyCommandContext,
	applyPlacement,
	assignmentPlacementRef,
	assignmentReturnColumns,
	type CommandContext,
	type CommandsResult,
	createCommand,
	type FieldWorkDb,
	type FieldWorkTransaction,
	handleCommandError,
	invalidUpdate,
	localDateColumn,
	nowLocalDate,
	type RouteOptions,
	readDate,
	readItemMappings,
	readJsonObject,
	readLifecycleTransition,
	readNullableText,
	readStringArray,
	readText,
	reindexItems,
	type SafeAssignment,
	softDelete,
	toSafeAssignment,
	updateRow,
	writeCommands,
} from './shared.js';

// ===========================================================================
// Assignments
// ===========================================================================

export function registerAssignmentRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/field-work/assignments', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const p = raw.payload;
		const result = createCommand(() =>
			createAssignmentCommand({
				...ctx,
				assignmentId: readText(p.id) ?? '',
				assignmentDate: readText(p.assignmentDate) ?? '',
				assignmentName: readNullableText(p.assignmentName),
				assignedToProfileId: readNullableText(p.assignedToProfileId),
				dueAt: readDate(p.dueAt),
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runAssignmentCommands(context, options.db, [result.command], 201);
	});

	app.post('/field-work/assignments/from-route', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const p = raw.payload;
		const result = createCommand(() =>
			createAssignmentFromRouteCommand({
				...ctx,
				assignmentId: readText(p.id) ?? '',
				routeId: readText(p.routeId) ?? '',
				assignmentDate: readText(p.assignmentDate) ?? '',
				assignmentName: readNullableText(p.assignmentName),
				assignedToProfileId: readNullableText(p.assignedToProfileId),
				dueAt: readDate(p.dueAt),
				assignmentItemIds: readItemMappings(p.assignmentItemIds),
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runAssignmentCommands(context, options.db, [result.command], 201);
	});

	app.post(
		'/field-work/assignments/self-assign-route',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const p = raw.payload;
			const result = createCommand(() =>
				selfAssignRouteCommand({
					...ctx,
					assignmentId: readText(p.id) ?? '',
					routeId: readText(p.routeId) ?? '',
					assignmentItemIds: readItemMappings(p.assignmentItemIds),
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runAssignmentCommands(context, options.db, [result.command], 201);
		},
	);

	app.patch(
		'/field-work/assignments/:assignmentId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const commandsResult = buildAssignmentUpdateCommands(
				context.get('authContext'),
				context.req.param('assignmentId'),
				raw.payload,
			);
			if (!commandsResult.ok) {
				return context.json(commandsResult.body, 400);
			}
			return runAssignmentCommands(context, options.db, commandsResult.commands);
		},
	);

	app.delete(
		'/field-work/assignments/:assignmentId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				deleteAssignmentCommand({
					...ctx,
					assignmentId: context.req.param('assignmentId'),
					acknowledgedAssignmentItemDeletion: true,
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runAssignmentCommands(context, options.db, [result.command]);
		},
	);

	app.post(
		'/field-work/assignments/:assignmentId/move-items',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				moveAssignmentItemsCommand({
					...ctx,
					assignmentId: context.req.param('assignmentId'),
					assignmentItemIds: readStringArray(raw.payload.assignmentItemIds),
					placement: raw.payload.placement as AssignmentItemPlacement,
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runAssignmentCommands(context, options.db, [result.command]);
		},
	);
}

function buildAssignmentUpdateCommands(
	authContext: AuthContext,
	assignmentId: string,
	payload: Record<string, unknown>,
): CommandsResult {
	const ctx = agencyCommandContext(authContext);
	const commands: FieldWorkCommand[] = [];

	const detailKeys = ['assignmentDate', 'assignmentName', 'assignedToProfileId', 'dueAt'];
	if (detailKeys.some((key) => key in payload)) {
		const result = createCommand(() =>
			updateAssignmentDetailsCommand({
				...ctx,
				assignmentId,
				...('assignmentDate' in payload
					? { assignmentDate: readText(payload.assignmentDate) ?? '' }
					: {}),
				...('assignmentName' in payload
					? { assignmentName: readNullableText(payload.assignmentName) }
					: {}),
				...('assignedToProfileId' in payload
					? { assignedToProfileId: readNullableText(payload.assignedToProfileId) }
					: {}),
				...('dueAt' in payload ? { dueAt: readDate(payload.dueAt) } : {}),
			}),
		);
		if (!result.ok) {
			return result;
		}
		commands.push(result.command);
	}

	const lifecycle = readLifecycleTransition(payload);
	if (lifecycle === 'complete') {
		const result = createCommand(() =>
			completeAssignmentCommand({
				...ctx,
				assignmentId,
				completedAt: readDate(payload.completedAt),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	} else if (lifecycle === 'cancel') {
		const result = createCommand(() =>
			cancelAssignmentCommand({
				...ctx,
				assignmentId,
				cancelledAt: readDate(payload.cancelledAt),
				cancellationReason: readNullableText(payload.cancellationReason),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	} else if (lifecycle === 'start') {
		const result = createCommand(() =>
			startAssignmentCommand({ ...ctx, assignmentId, startedAt: readDate(payload.startedAt) }),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	} else if (lifecycle === 'reopen') {
		const result = createCommand(() => reopenAssignmentCommand({ ...ctx, assignmentId }));
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('assignment');
	}
	return { ok: true, commands };
}

async function runAssignmentCommands(
	context: CommandContext,
	db: FieldWorkDb,
	commands: readonly FieldWorkCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeCommands(db, commands, writeAssignmentCommand);
		if (result.row === null) {
			return context.json({ error: 'assignment_not_found' }, 404);
		}
		return context.json({ assignment: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeAssignmentCommand(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
): Promise<SafeAssignment | null> {
	switch (command.type) {
		case 'fieldWork.createAssignment':
			return insertAssignment(trx, command.payload);
		case 'fieldWork.createAssignmentFromRoute': {
			const assignment = await insertAssignment(trx, command.payload);
			await copyRouteItemsToAssignment(
				trx,
				command.payload.organizationId,
				command.payload.routeId,
				command.payload.assignmentId,
				command.payload.assignmentItemIds,
				command.payload.actorProfileId,
			);
			return assignment;
		}
		case 'fieldWork.selfAssignRoute': {
			const assignment = await insertAssignment(trx, {
				...command.payload,
				assignmentDate: nowLocalDate(),
				assignmentName: null,
				assignedToProfileId: command.payload.actorProfileId,
				dueAt: null,
			});
			await copyRouteItemsToAssignment(
				trx,
				command.payload.organizationId,
				command.payload.routeId,
				command.payload.assignmentId,
				command.payload.assignmentItemIds,
				command.payload.actorProfileId,
			);
			return assignment;
		}
		case 'fieldWork.updateAssignmentDetails': {
			const changes = command.payload.changes;
			return updateRow(
				trx,
				'assignments',
				command.payload.assignmentId,
				command.payload.organizationId,
				{
					...('assignmentDate' in changes && changes.assignmentDate !== undefined
						? { assignment_date: localDateColumn(changes.assignmentDate) }
						: {}),
					...('assignmentName' in changes
						? { assignment_name: changes.assignmentName ?? null }
						: {}),
					...('assignedToProfileId' in changes
						? { assigned_to_profile_id: changes.assignedToProfileId ?? null }
						: {}),
					...('dueAt' in changes ? { due_at: changes.dueAt ?? null } : {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				assignmentReturnColumns,
				toSafeAssignment,
			);
		}
		case 'fieldWork.startAssignment':
			return updateRow(
				trx,
				'assignments',
				command.payload.assignmentId,
				command.payload.organizationId,
				{
					started_at: command.payload.startedAt === null ? sql`now()` : command.payload.startedAt,
					assigned_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				assignmentReturnColumns,
				toSafeAssignment,
			);
		case 'fieldWork.completeAssignment':
			return updateRow(
				trx,
				'assignments',
				command.payload.assignmentId,
				command.payload.organizationId,
				{
					completed_at:
						command.payload.completedAt === null ? sql`now()` : command.payload.completedAt,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				assignmentReturnColumns,
				toSafeAssignment,
			);
		case 'fieldWork.cancelAssignment':
			return updateRow(
				trx,
				'assignments',
				command.payload.assignmentId,
				command.payload.organizationId,
				{
					cancelled_at:
						command.payload.cancelledAt === null ? sql`now()` : command.payload.cancelledAt,
					cancellation_reason: command.payload.cancellationReason,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				assignmentReturnColumns,
				toSafeAssignment,
			);
		case 'fieldWork.reopenAssignment':
			return updateRow(
				trx,
				'assignments',
				command.payload.assignmentId,
				command.payload.organizationId,
				{
					started_at: null,
					completed_at: null,
					cancelled_at: null,
					cancellation_reason: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				assignmentReturnColumns,
				toSafeAssignment,
			);
		case 'fieldWork.deleteAssignment':
			return softDelete(
				trx,
				'assignments',
				command.payload.assignmentId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				assignmentReturnColumns,
				toSafeAssignment,
			);
		case 'fieldWork.moveAssignmentItems': {
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
						command.payload.assignmentItemIds,
						command.payload.placement.kind,
						assignmentPlacementRef(command.payload.placement),
					),
			);
			return loadAssignment(trx, command.payload.assignmentId, command.payload.organizationId);
		}
		default:
			throw new Error(`Unsupported assignment command: ${command.type}`);
	}
}

async function insertAssignment(
	trx: FieldWorkTransaction,
	payload: {
		readonly assignmentId: string;
		readonly organizationId: string;
		readonly assignmentDate: string;
		readonly assignmentName: string | null;
		readonly assignedToProfileId: string | null;
		readonly dueAt: Date | null;
		readonly actorProfileId: string;
	},
): Promise<SafeAssignment> {
	const row = await trx
		.insertInto('assignments')
		.values({
			id: payload.assignmentId,
			organization_id: payload.organizationId,
			assignment_name: payload.assignmentName,
			assigned_to_profile_id: payload.assignedToProfileId,
			assigned_by_profile_id: payload.actorProfileId,
			assignment_date: localDateColumn(payload.assignmentDate),
			due_at: payload.dueAt,
			created_by_profile_id: payload.actorProfileId,
			updated_by_profile_id: payload.actorProfileId,
		})
		.returning(assignmentReturnColumns)
		.executeTakeFirstOrThrow();
	return toSafeAssignment(row);
}

async function copyRouteItemsToAssignment(
	trx: FieldWorkTransaction,
	organizationId: string,
	routeId: string,
	assignmentId: string,
	mappings: readonly { readonly routeItemId: string; readonly assignmentItemId: string }[],
	actorProfileId: string,
): Promise<void> {
	const routeItems = await trx
		.selectFrom('route_items')
		.select(['id', 'entity_type', 'entity_id', 'directions_to_next_item'])
		.where('route_id', '=', routeId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.orderBy('position', 'asc')
		.execute();
	const byRouteItem = new Map(mappings.map((m) => [m.routeItemId, m.assignmentItemId]));
	let position = 0;
	for (const routeItem of routeItems) {
		const assignmentItemId = byRouteItem.get(routeItem.id);
		if (assignmentItemId === undefined) {
			continue;
		}
		await trx
			.insertInto('assignment_items')
			.values({
				id: assignmentItemId,
				organization_id: organizationId,
				assignment_id: assignmentId,
				entity_type: routeItem.entity_type,
				entity_id: routeItem.entity_id,
				position,
				directions_to_next_item: routeItem.directions_to_next_item,
				created_by_profile_id: actorProfileId,
				updated_by_profile_id: actorProfileId,
			})
			.execute();
		position += 1;
	}
}

async function loadAssignment(
	trx: FieldWorkTransaction,
	assignmentId: string,
	organizationId: string,
): Promise<SafeAssignment | null> {
	const row = await trx
		.selectFrom('assignments')
		.select(assignmentReturnColumns)
		.where('id', '=', assignmentId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row === undefined ? null : toSafeAssignment(row);
}

import { applyRecordDeletion, sql } from '@simmer-mosquito/db';
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
import { readNullableText, readText } from '../command-payload.js';
import {
	assertAssignmentTransition,
	checkCompleteAssignment,
	checkReopenAssignment,
	checkStartAssignment,
} from './assignment-lifecycle.js';
import {
	agencyCommandContext,
	applyPlacement,
	assignmentPlacementRef,
	assignmentReturnColumns,
	type CommandContext,
	type CommandsResult,
	commandEndpoint,
	createCommand,
	type FieldWorkDb,
	type FieldWorkTransaction,
	invalidUpdate,
	localDateColumn,
	nowLocalDate,
	type RouteOptions,
	readDate,
	readItemMappings,
	readLifecycleTransition,
	readStringArray,
	reindexItems,
	runCommands,
	type SafeAssignment,
	softDelete,
	toSafeAssignment,
	updateRow,
} from './shared.js';

// ===========================================================================
// Assignments
// ===========================================================================

export function registerAssignmentRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/field-work/assignments',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				createAssignmentCommand({
					...ctx,
					assignmentId: readText(payload.id) ?? '',
					assignmentDate: readText(payload.assignmentDate) ?? '',
					assignmentName: readNullableText(payload.assignmentName),
					assignedToProfileId: readNullableText(payload.assignedToProfileId),
					dueAt: readDate(payload.dueAt),
				}),
			run: (context, commands) => runAssignmentCommands(context, options.db, commands, 201),
		}),
	);

	app.post(
		'/field-work/assignments/from-route',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				createAssignmentFromRouteCommand({
					...ctx,
					assignmentId: readText(payload.id) ?? '',
					routeId: readText(payload.routeId) ?? '',
					assignmentDate: readText(payload.assignmentDate) ?? '',
					assignmentName: readNullableText(payload.assignmentName),
					assignedToProfileId: readNullableText(payload.assignedToProfileId),
					dueAt: readDate(payload.dueAt),
					assignmentItemIds: readItemMappings(payload.assignmentItemIds),
				}),
			run: (context, commands) => runAssignmentCommands(context, options.db, commands, 201),
		}),
	);

	app.post(
		'/field-work/assignments/self-assign-route',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				selfAssignRouteCommand({
					...ctx,
					assignmentId: readText(payload.id) ?? '',
					routeId: readText(payload.routeId) ?? '',
					assignmentItemIds: readItemMappings(payload.assignmentItemIds),
				}),
			run: (context, commands) => runAssignmentCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/field-work/assignments/:assignmentId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, authContext, param }) =>
				buildAssignmentUpdateCommands(authContext, param('assignmentId'), payload),
			run: (context, commands) => runAssignmentCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/field-work/assignments/:assignmentId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				deleteAssignmentCommand({
					...ctx,
					assignmentId: param('assignmentId'),
					acknowledgedAssignmentItemDeletion: true,
				}),
			run: (context, commands) => runAssignmentCommands(context, options.db, commands),
		}),
	);

	app.post(
		'/field-work/assignments/:assignmentId/move-items',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx, param }) =>
				moveAssignmentItemsCommand({
					...ctx,
					assignmentId: param('assignmentId'),
					assignmentItemIds: readStringArray(payload.assignmentItemIds),
					placement: payload.placement as AssignmentItemPlacement,
				}),
			run: (context, commands) => runAssignmentCommands(context, options.db, commands),
		}),
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
	return runCommands(
		context,
		{ db, write: writeAssignmentCommand, notFound: 'assignment_not_found', key: 'assignment' },
		commands,
		createdStatus,
	);
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
			await assertAssignmentTransition(
				trx,
				command.payload.assignmentId,
				command.payload.organizationId,
				checkStartAssignment,
			);
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
			await assertAssignmentTransition(
				trx,
				command.payload.assignmentId,
				command.payload.organizationId,
				checkCompleteAssignment,
			);
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
			await assertAssignmentTransition(
				trx,
				command.payload.assignmentId,
				command.payload.organizationId,
				checkReopenAssignment,
			);
			// `started_at` deliberately survives: reopening resumes work rather than
			// resetting it, so an assignment that had been started comes back as in
			// progress. Nothing else on the row records when the crew actually
			// started, so clearing it would discard that for good.
			return updateRow(
				trx,
				'assignments',
				command.payload.assignmentId,
				command.payload.organizationId,
				{
					completed_at: null,
					cancelled_at: null,
					cancellation_reason: null,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				assignmentReturnColumns,
				toSafeAssignment,
			);
		case 'fieldWork.deleteAssignment':
			await applyRecordDeletion(trx, {
				recordType: 'assignment',
				recordId: command.payload.assignmentId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
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

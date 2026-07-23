import {
	type Kysely,
	type MutationWriteResult,
	type SimmerDatabase,
	sql,
	type Transaction,
} from '@simmer-mosquito/db';
import {
	type AssignmentItemPlacement,
	type AssignmentItemTarget,
	addAdditionalPersonnelCommand,
	addAssignmentItemCommand,
	addCommentCommand,
	addRouteItemCommand,
	assignTagCommand,
	cancelAssignmentCommand,
	completeAssignmentCommand,
	completeAssignmentItemCommand,
	createAssignmentCommand,
	createAssignmentFromRouteCommand,
	createRouteCommand,
	DomainValidationError,
	deleteAssignmentCommand,
	deleteCommentCommand,
	deleteRouteCommand,
	type FieldWorkCommand,
	moveAssignmentItemsCommand,
	moveRouteItemsCommand,
	pinCommentCommand,
	type RouteItemPlacement,
	type RouteItemTarget,
	removeAdditionalPersonnelCommand,
	removeAssignmentItemCommand,
	removeRouteItemCommand,
	reopenAssignmentCommand,
	reopenAssignmentItemCommand,
	selfAssignRouteCommand,
	skipAssignmentItemCommand,
	startAssignmentCommand,
	type TagTarget,
	toDbEntityType,
	unassignTagCommand,
	unpinCommentCommand,
	unskipAssignmentItemCommand,
	updateAssignmentDetailsCommand,
	updateAssignmentItemCommand,
	updateCommentCommand,
	updateRouteDetailsCommand,
	updateRouteItemCommand,
} from '@simmer-mosquito/domain';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';

type FieldWorkDb = Kysely<SimmerDatabase>;
type FieldWorkTransaction = Transaction<SimmerDatabase>;
type CommandContext = Context<{ Variables: AuthVariables }>;

/**
 * Field-work command endpoints: comments, tag assignments, additional personnel,
 * routes (+ ordered route items), and assignments (+ ordered assignment items).
 *
 * Client issues plain optimistic POST/PATCH/DELETE per row; the server decomposes
 * each into the field-work domain command vocabulary. Ordered child rows
 * (route/assignment items) are reindexed on insert/move so the integer `position`
 * column stays contiguous. Assignment + item lifecycle transitions are derived
 * from the changed timestamp fields in a PATCH.
 */
export function registerFieldWorkCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	registerCommentRoutes(app, options);
	registerTagItemRoutes(app, options);
	registerAdditionalPersonnelRoutes(app, options);
	registerRouteRoutes(app, options);
	registerRouteItemRoutes(app, options);
	registerAssignmentRoutes(app, options);
	registerAssignmentItemRoutes(app, options);
}

// ===========================================================================
// Comments
// ===========================================================================

function registerCommentRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/field-work/comments', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			addCommentCommand({
				...ctx,
				commentId: readText(raw.payload.id) ?? '',
				target: readTarget(raw.payload),
				commentText: readText(raw.payload.commentText) ?? '',
				commentedAt: readDate(raw.payload.commentedAt),
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runCommentCommands(context, options.db, [result.command], 201);
	});

	app.patch('/field-work/comments/:commentId', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const commentId = context.req.param('commentId');
		const commands: FieldWorkCommand[] = [];
		if ('commentText' in raw.payload) {
			const result = createCommand(() =>
				updateCommentCommand({
					...ctx,
					commentId,
					commentText: readText(raw.payload.commentText) ?? '',
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			commands.push(result.command);
		}
		if (typeof raw.payload.isPinned === 'boolean') {
			const result = createCommand(() =>
				raw.payload.isPinned
					? pinCommentCommand({ ...ctx, commentId })
					: unpinCommentCommand({ ...ctx, commentId }),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			commands.push(result.command);
		}
		if (commands.length === 0) {
			return context.json(invalidUpdate('comment').body, 400);
		}
		return runCommentCommands(context, options.db, commands);
	});

	app.delete('/field-work/comments/:commentId', options.authContextMiddleware, async (context) => {
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			deleteCommentCommand({ ...ctx, commentId: context.req.param('commentId') }),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runCommentCommands(context, options.db, [result.command]);
	});
}

async function runCommentCommands(
	context: CommandContext,
	db: FieldWorkDb,
	commands: readonly FieldWorkCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeCommands(db, commands, writeCommentCommand);
		if (result.row === null) {
			return context.json({ error: 'comment_not_found' }, 404);
		}
		return context.json({ comment: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeCommentCommand(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
): Promise<SafeComment | null> {
	switch (command.type) {
		case 'fieldWork.addComment': {
			const row = await trx
				.insertInto('comments')
				.values({
					id: command.payload.commentId,
					organization_id: command.payload.organizationId,
					entity_type: toDbEntityType(command.payload.target.type),
					entity_id: command.payload.target.id,
					comment_text: command.payload.commentText,
					commented_by_profile_id: command.payload.actorProfileId,
					...(command.payload.commentedAt === null
						? {}
						: { commented_at: command.payload.commentedAt }),
					is_pinned: false,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(commentReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeComment(row);
		}
		case 'fieldWork.updateComment':
			return updateRow(
				trx,
				'comments',
				command.payload.commentId,
				command.payload.organizationId,
				{
					comment_text: command.payload.commentText,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				commentReturnColumns,
				toSafeComment,
			);
		case 'fieldWork.pinComment':
			return updateRow(
				trx,
				'comments',
				command.payload.commentId,
				command.payload.organizationId,
				{
					is_pinned: true,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				commentReturnColumns,
				toSafeComment,
			);
		case 'fieldWork.unpinComment':
			return updateRow(
				trx,
				'comments',
				command.payload.commentId,
				command.payload.organizationId,
				{
					is_pinned: false,
					updated_by_profile_id: command.payload.actorProfileId,
				},
				commentReturnColumns,
				toSafeComment,
			);
		case 'fieldWork.deleteComment':
			return softDelete(
				trx,
				'comments',
				command.payload.commentId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				commentReturnColumns,
				toSafeComment,
			);
		default:
			throw new Error(`Unsupported comment command: ${command.type}`);
	}
}

// ===========================================================================
// Tag items
// ===========================================================================

function registerTagItemRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/field-work/tag-items', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			assignTagCommand({
				...ctx,
				tagItemId: readText(raw.payload.id) ?? '',
				tagId: readText(raw.payload.tagId) ?? '',
				target: readTarget(raw.payload) as TagTarget,
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runTagItemCommands(context, options.db, [result.command], 201);
	});

	app.delete('/field-work/tag-items/:tagItemId', options.authContextMiddleware, async (context) => {
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			unassignTagCommand({ ...ctx, tagItemId: context.req.param('tagItemId') }),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runTagItemCommands(context, options.db, [result.command]);
	});
}

async function runTagItemCommands(
	context: CommandContext,
	db: FieldWorkDb,
	commands: readonly FieldWorkCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeCommands(db, commands, writeTagItemCommand);
		if (result.row === null) {
			return context.json({ error: 'tag_item_not_found' }, 404);
		}
		return context.json({ tagItem: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeTagItemCommand(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
): Promise<SafeTagItem | null> {
	switch (command.type) {
		case 'fieldWork.assignTag': {
			const row = await trx
				.insertInto('tag_items')
				.values({
					id: command.payload.tagItemId,
					organization_id: command.payload.organizationId,
					tag_id: command.payload.tagId,
					entity_type: toDbEntityType(command.payload.target.type),
					entity_id: command.payload.target.id,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(tagItemReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeTagItem(row);
		}
		case 'fieldWork.unassignTag':
			return softDelete(
				trx,
				'tag_items',
				command.payload.tagItemId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				tagItemReturnColumns,
				toSafeTagItem,
			);
		default:
			throw new Error(`Unsupported tag item command: ${command.type}`);
	}
}

// ===========================================================================
// Additional personnel
// ===========================================================================

function registerAdditionalPersonnelRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/field-work/additional-personnel', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			addAdditionalPersonnelCommand({
				...ctx,
				additionalPersonnelId: readText(raw.payload.id) ?? '',
				target: readTarget(raw.payload),
				personnelProfileId: readText(raw.payload.personnelProfileId) ?? '',
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runAdditionalPersonnelCommands(context, options.db, [result.command], 201);
	});

	app.delete(
		'/field-work/additional-personnel/:additionalPersonnelId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				removeAdditionalPersonnelCommand({
					...ctx,
					additionalPersonnelId: context.req.param('additionalPersonnelId'),
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runAdditionalPersonnelCommands(context, options.db, [result.command]);
		},
	);
}

async function runAdditionalPersonnelCommands(
	context: CommandContext,
	db: FieldWorkDb,
	commands: readonly FieldWorkCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeCommands(db, commands, writeAdditionalPersonnelCommand);
		if (result.row === null) {
			return context.json({ error: 'additional_personnel_not_found' }, 404);
		}
		return context.json(
			{ additionalPersonnel: result.row, txid: result.txid },
			createdStatus ?? 200,
		);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeAdditionalPersonnelCommand(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
): Promise<SafeAdditionalPersonnel | null> {
	switch (command.type) {
		case 'fieldWork.addAdditionalPersonnel': {
			const row = await trx
				.insertInto('additional_personnel')
				.values({
					id: command.payload.additionalPersonnelId,
					organization_id: command.payload.organizationId,
					personnel_profile_id: command.payload.personnelProfileId,
					entity_type: toDbEntityType(command.payload.target.type),
					entity_id: command.payload.target.id,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(additionalPersonnelReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeAdditionalPersonnel(row);
		}
		case 'fieldWork.removeAdditionalPersonnel':
			return softDelete(
				trx,
				'additional_personnel',
				command.payload.additionalPersonnelId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				additionalPersonnelReturnColumns,
				toSafeAdditionalPersonnel,
			);
		default:
			throw new Error(`Unsupported additional personnel command: ${command.type}`);
	}
}

// ===========================================================================
// Routes
// ===========================================================================

function registerRouteRoutes(app: Hono<{ Variables: AuthVariables }>, options: RouteOptions): void {
	app.post('/field-work/routes', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			createRouteCommand({
				...ctx,
				routeId: readText(raw.payload.id) ?? '',
				routeName: readText(raw.payload.routeName) ?? '',
				routeType: (readText(raw.payload.routeType) ?? '') as never,
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runRouteCommands(context, options.db, [result.command], 201);
	});

	app.patch('/field-work/routes/:routeId', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			updateRouteDetailsCommand({
				...ctx,
				routeId: context.req.param('routeId'),
				routeName: readText(raw.payload.routeName) ?? '',
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runRouteCommands(context, options.db, [result.command]);
	});

	app.delete('/field-work/routes/:routeId', options.authContextMiddleware, async (context) => {
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			deleteRouteCommand({
				...ctx,
				routeId: context.req.param('routeId'),
				acknowledgedRouteItemDeletion: true,
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runRouteCommands(context, options.db, [result.command]);
	});

	app.post(
		'/field-work/routes/:routeId/move-items',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				moveRouteItemsCommand({
					...ctx,
					routeId: context.req.param('routeId'),
					routeItemIds: readStringArray(raw.payload.routeItemIds),
					placement: raw.payload.placement as RouteItemPlacement,
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runRouteCommands(context, options.db, [result.command]);
		},
	);
}

async function runRouteCommands(
	context: CommandContext,
	db: FieldWorkDb,
	commands: readonly FieldWorkCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeCommands(db, commands, writeRouteCommand);
		if (result.row === null) {
			return context.json({ error: 'route_not_found' }, 404);
		}
		return context.json({ route: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeRouteCommand(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
): Promise<SafeRoute | null> {
	switch (command.type) {
		case 'fieldWork.createRoute': {
			const row = await trx
				.insertInto('routes')
				.values({
					id: command.payload.routeId,
					organization_id: command.payload.organizationId,
					route_name: command.payload.routeName,
					route_type: command.payload.routeType,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(routeReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeRoute(row);
		}
		case 'fieldWork.updateRouteDetails':
			return updateRow(
				trx,
				'routes',
				command.payload.routeId,
				command.payload.organizationId,
				{
					...('routeName' in command.payload.changes
						? { route_name: command.payload.changes.routeName }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				routeReturnColumns,
				toSafeRoute,
			);
		case 'fieldWork.deleteRoute':
			return softDelete(
				trx,
				'routes',
				command.payload.routeId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				routeReturnColumns,
				toSafeRoute,
			);
		case 'fieldWork.moveRouteItems': {
			await reindexItems(
				trx,
				'route_items',
				'route_id',
				command.payload.routeId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				(ids) =>
					applyPlacement(
						ids,
						command.payload.routeItemIds,
						command.payload.placement.kind,
						routePlacementRef(command.payload.placement),
					),
			);
			return loadRoute(trx, command.payload.routeId, command.payload.organizationId);
		}
		default:
			throw new Error(`Unsupported route command: ${command.type}`);
	}
}

async function loadRoute(
	trx: FieldWorkTransaction,
	routeId: string,
	organizationId: string,
): Promise<SafeRoute | null> {
	const row = await trx
		.selectFrom('routes')
		.select(routeReturnColumns)
		.where('id', '=', routeId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row === undefined ? null : toSafeRoute(row);
}

// ===========================================================================
// Route items
// ===========================================================================

function registerRouteItemRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/field-work/route-items', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			addRouteItemCommand({
				...ctx,
				routeItemId: readText(raw.payload.id) ?? '',
				routeId: readText(raw.payload.routeId) ?? '',
				target: readTarget(raw.payload) as RouteItemTarget,
				...(raw.payload.placement === undefined
					? {}
					: { placement: raw.payload.placement as RouteItemPlacement }),
				directionsToNextItem: readNullableText(raw.payload.directionsToNextItem),
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runRouteItemCommands(context, options.db, [result.command], 201);
	});

	app.patch(
		'/field-work/route-items/:routeItemId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				updateRouteItemCommand({
					...ctx,
					routeItemId: context.req.param('routeItemId'),
					directionsToNextItem: readNullableText(raw.payload.directionsToNextItem),
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runRouteItemCommands(context, options.db, [result.command]);
		},
	);

	app.delete(
		'/field-work/route-items/:routeItemId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				removeRouteItemCommand({ ...ctx, routeItemId: context.req.param('routeItemId') }),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runRouteItemCommands(context, options.db, [result.command]);
		},
	);
}

async function runRouteItemCommands(
	context: CommandContext,
	db: FieldWorkDb,
	commands: readonly FieldWorkCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeCommands(db, commands, writeRouteItemCommand);
		if (result.row === null) {
			return context.json({ error: 'route_item_not_found' }, 404);
		}
		return context.json({ routeItem: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeRouteItemCommand(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
): Promise<SafeRouteItem | null> {
	switch (command.type) {
		case 'fieldWork.addRouteItem': {
			await trx
				.insertInto('route_items')
				.values({
					id: command.payload.routeItemId,
					organization_id: command.payload.organizationId,
					route_id: command.payload.routeId,
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
				'route_items',
				'route_id',
				command.payload.routeId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				(ids) =>
					applyPlacement(
						ids,
						[command.payload.routeItemId],
						command.payload.placement.kind,
						routePlacementRef(command.payload.placement),
					),
			);
			return loadRouteItem(trx, command.payload.routeItemId, command.payload.organizationId);
		}
		case 'fieldWork.updateRouteItem':
			return updateRow(
				trx,
				'route_items',
				command.payload.routeItemId,
				command.payload.organizationId,
				{
					...('directionsToNextItem' in command.payload.changes
						? { directions_to_next_item: command.payload.changes.directionsToNextItem ?? null }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				routeItemReturnColumns,
				toSafeRouteItem,
			);
		case 'fieldWork.removeRouteItem':
			return softDelete(
				trx,
				'route_items',
				command.payload.routeItemId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				routeItemReturnColumns,
				toSafeRouteItem,
			);
		default:
			throw new Error(`Unsupported route item command: ${command.type}`);
	}
}

async function loadRouteItem(
	trx: FieldWorkTransaction,
	routeItemId: string,
	organizationId: string,
): Promise<SafeRouteItem | null> {
	const row = await trx
		.selectFrom('route_items')
		.select(routeItemReturnColumns)
		.where('id', '=', routeItemId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row === undefined ? null : toSafeRouteItem(row);
}

// ===========================================================================
// Assignments
// ===========================================================================

function registerAssignmentRoutes(
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

// ===========================================================================
// Assignment items
// ===========================================================================

function registerAssignmentItemRoutes(
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
	try {
		const result = await writeCommands(db, commands, writeAssignmentItemCommand);
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

// ===========================================================================
// Ordering helpers
// ===========================================================================

type OrderedItemTable = 'route_items' | 'assignment_items';

async function reindexItems(
	trx: FieldWorkTransaction,
	table: OrderedItemTable,
	parentColumn: 'route_id' | 'assignment_id',
	parentId: string,
	organizationId: string,
	actorProfileId: string,
	reorder: (orderedIds: readonly string[]) => readonly string[],
): Promise<void> {
	const rows = await trx
		.selectFrom(table)
		.select('id')
		.where(parentColumn, '=', parentId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.orderBy('position', 'asc')
		.orderBy('created_at', 'asc')
		.execute();
	const ordered = reorder(rows.map((row) => row.id));
	for (let index = 0; index < ordered.length; index += 1) {
		await trx
			.updateTable(table)
			.set({ position: index, updated_by_profile_id: actorProfileId, updated_at: sql`now()` })
			.where('id', '=', ordered[index] as string)
			.where('organization_id', '=', organizationId)
			.execute();
	}
}

function applyPlacement(
	orderedIds: readonly string[],
	movingIds: readonly string[],
	kind: 'start' | 'end' | 'before' | 'after',
	refId: string | null,
): readonly string[] {
	const moving = movingIds.filter((id) => orderedIds.includes(id));
	const remaining = orderedIds.filter((id) => !moving.includes(id));
	if (kind === 'start') {
		return [...moving, ...remaining];
	}
	if (kind === 'before' || kind === 'after') {
		const refIndex = refId === null ? -1 : remaining.indexOf(refId);
		if (refIndex !== -1) {
			const insertAt = kind === 'before' ? refIndex : refIndex + 1;
			return [...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)];
		}
	}
	return [...remaining, ...moving];
}

function routePlacementRef(placement: RouteItemPlacement): string | null {
	return placement.kind === 'before' || placement.kind === 'after' ? placement.routeItemId : null;
}

function assignmentPlacementRef(placement: AssignmentItemPlacement): string | null {
	return placement.kind === 'before' || placement.kind === 'after'
		? placement.assignmentItemId
		: null;
}

// ===========================================================================
// Lifecycle transition derivation (from changed timestamp fields)
// ===========================================================================

type AssignmentLifecycle = 'start' | 'complete' | 'cancel' | 'reopen' | null;

function readLifecycleTransition(payload: Record<string, unknown>): AssignmentLifecycle {
	if ('completedAt' in payload && payload.completedAt !== null) {
		return 'complete';
	}
	if ('cancelledAt' in payload && payload.cancelledAt !== null) {
		return 'cancel';
	}
	if ('startedAt' in payload && payload.startedAt !== null) {
		return 'start';
	}
	if (
		('completedAt' in payload && payload.completedAt === null) ||
		('cancelledAt' in payload && payload.cancelledAt === null) ||
		('startedAt' in payload && payload.startedAt === null)
	) {
		return 'reopen';
	}
	return null;
}

type ItemLifecycle = 'complete' | 'skip' | 'reopen' | 'unskip' | null;

function readItemLifecycleTransition(payload: Record<string, unknown>): ItemLifecycle {
	if ('skippedAt' in payload && payload.skippedAt !== null) {
		return 'skip';
	}
	if ('completedAt' in payload && payload.completedAt !== null) {
		return 'complete';
	}
	if ('skippedAt' in payload && payload.skippedAt === null) {
		return 'unskip';
	}
	if ('completedAt' in payload && payload.completedAt === null) {
		return 'reopen';
	}
	return null;
}

// ===========================================================================
// Generic row write helpers
// ===========================================================================

type WriteTable =
	| 'comments'
	| 'tag_items'
	| 'additional_personnel'
	| 'routes'
	| 'route_items'
	| 'assignments'
	| 'assignment_items';

async function updateRow<TRow, TSafe>(
	trx: FieldWorkTransaction,
	table: WriteTable,
	id: string,
	organizationId: string,
	set: Record<string, unknown>,
	columns: readonly string[],
	toSafe: (row: TRow) => TSafe,
): Promise<TSafe | null> {
	const row = await trx
		.updateTable(table)
		.set({ ...set, updated_at: sql`now()` } as never)
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(columns as never)
		.executeTakeFirst();
	return row === undefined ? null : toSafe(row as TRow);
}

async function softDelete<TRow, TSafe>(
	trx: FieldWorkTransaction,
	table: WriteTable,
	id: string,
	organizationId: string,
	actorProfileId: string,
	columns: readonly string[],
	toSafe: (row: TRow) => TSafe,
): Promise<TSafe | null> {
	const row = await trx
		.updateTable(table)
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: actorProfileId,
			updated_by_profile_id: actorProfileId,
			updated_at: sql`now()`,
		} as never)
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(columns as never)
		.executeTakeFirst();
	return row === undefined ? null : toSafe(row as TRow);
}

async function writeCommands<TSafe>(
	db: FieldWorkDb,
	commands: readonly FieldWorkCommand[],
	write: (trx: FieldWorkTransaction, command: FieldWorkCommand) => Promise<TSafe | null>,
): Promise<MutationWriteResult<TSafe | null>> {
	return db.transaction().execute(async (trx) => {
		let row: TSafe | null = null;
		for (const command of commands) {
			row = await write(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

// ===========================================================================
// Response shaping
// ===========================================================================

const commentReturnColumns = [
	'id',
	'organization_id',
	'entity_type',
	'entity_id',
	'comment_text',
	'commented_by_profile_id',
	'commented_at',
	'is_pinned',
	'created_at',
	'updated_at',
] as const;

interface SafeComment {
	readonly id: string;
	readonly organizationId: string;
	readonly entityType: string;
	readonly entityId: string;
	readonly commentText: string;
	readonly isPinned: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeComment(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly entity_type: string;
	readonly entity_id: string;
	readonly comment_text: string;
	readonly is_pinned: boolean;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeComment {
	return {
		id: row.id,
		organizationId: row.organization_id,
		entityType: row.entity_type,
		entityId: row.entity_id,
		commentText: row.comment_text,
		isPinned: row.is_pinned,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const tagItemReturnColumns = [
	'id',
	'organization_id',
	'tag_id',
	'entity_type',
	'entity_id',
	'created_at',
	'updated_at',
] as const;

interface SafeTagItem {
	readonly id: string;
	readonly organizationId: string;
	readonly tagId: string;
	readonly entityType: string;
	readonly entityId: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeTagItem(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly tag_id: string;
	readonly entity_type: string;
	readonly entity_id: string;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeTagItem {
	return {
		id: row.id,
		organizationId: row.organization_id,
		tagId: row.tag_id,
		entityType: row.entity_type,
		entityId: row.entity_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const additionalPersonnelReturnColumns = [
	'id',
	'organization_id',
	'personnel_profile_id',
	'entity_type',
	'entity_id',
	'created_at',
	'updated_at',
] as const;

interface SafeAdditionalPersonnel {
	readonly id: string;
	readonly organizationId: string;
	readonly personnelProfileId: string;
	readonly entityType: string;
	readonly entityId: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeAdditionalPersonnel(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly personnel_profile_id: string;
	readonly entity_type: string;
	readonly entity_id: string;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeAdditionalPersonnel {
	return {
		id: row.id,
		organizationId: row.organization_id,
		personnelProfileId: row.personnel_profile_id,
		entityType: row.entity_type,
		entityId: row.entity_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const routeReturnColumns = [
	'id',
	'organization_id',
	'route_name',
	'route_type',
	'created_at',
	'updated_at',
] as const;

interface SafeRoute {
	readonly id: string;
	readonly organizationId: string;
	readonly routeName: string;
	readonly routeType: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeRoute(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly route_name: string;
	readonly route_type: string;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeRoute {
	return {
		id: row.id,
		organizationId: row.organization_id,
		routeName: row.route_name,
		routeType: row.route_type,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const routeItemReturnColumns = [
	'id',
	'organization_id',
	'route_id',
	'entity_type',
	'entity_id',
	'position',
	'directions_to_next_item',
	'created_at',
	'updated_at',
] as const;

interface SafeRouteItem {
	readonly id: string;
	readonly organizationId: string;
	readonly routeId: string;
	readonly entityType: string;
	readonly entityId: string;
	readonly position: number;
	readonly directionsToNextItem: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeRouteItem(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly route_id: string;
	readonly entity_type: string;
	readonly entity_id: string;
	readonly position: number;
	readonly directions_to_next_item: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeRouteItem {
	return {
		id: row.id,
		organizationId: row.organization_id,
		routeId: row.route_id,
		entityType: row.entity_type,
		entityId: row.entity_id,
		position: row.position,
		directionsToNextItem: row.directions_to_next_item,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const assignmentReturnColumns = [
	'id',
	'organization_id',
	'assignment_name',
	'assigned_to_profile_id',
	'assignment_date',
	'started_at',
	'completed_at',
	'cancelled_at',
	'created_at',
	'updated_at',
] as const;

interface SafeAssignment {
	readonly id: string;
	readonly organizationId: string;
	readonly assignmentName: string | null;
	readonly assignedToProfileId: string | null;
	readonly startedAt: Date | null;
	readonly completedAt: Date | null;
	readonly cancelledAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeAssignment(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly assignment_name: string | null;
	readonly assigned_to_profile_id: string | null;
	readonly started_at: Date | null;
	readonly completed_at: Date | null;
	readonly cancelled_at: Date | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeAssignment {
	return {
		id: row.id,
		organizationId: row.organization_id,
		assignmentName: row.assignment_name,
		assignedToProfileId: row.assigned_to_profile_id,
		startedAt: row.started_at,
		completedAt: row.completed_at,
		cancelledAt: row.cancelled_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const assignmentItemReturnColumns = [
	'id',
	'organization_id',
	'assignment_id',
	'entity_type',
	'entity_id',
	'position',
	'directions_to_next_item',
	'completed_at',
	'skipped_at',
	'skip_reason',
	'created_at',
	'updated_at',
] as const;

interface SafeAssignmentItem {
	readonly id: string;
	readonly organizationId: string;
	readonly assignmentId: string;
	readonly entityType: string;
	readonly entityId: string;
	readonly position: number;
	readonly completedAt: Date | null;
	readonly skippedAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeAssignmentItem(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly assignment_id: string;
	readonly entity_type: string;
	readonly entity_id: string;
	readonly position: number;
	readonly completed_at: Date | null;
	readonly skipped_at: Date | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeAssignmentItem {
	return {
		id: row.id,
		organizationId: row.organization_id,
		assignmentId: row.assignment_id,
		entityType: row.entity_type,
		entityId: row.entity_id,
		position: row.position,
		completedAt: row.completed_at,
		skippedAt: row.skipped_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

// ===========================================================================
// Shared command + request helpers
// ===========================================================================

interface RouteOptions {
	readonly db: FieldWorkDb;
	readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
}

type CommandsResult =
	| { readonly ok: true; readonly commands: readonly FieldWorkCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody };

class CommandError extends Error {
	constructor(
		readonly status: 400 | 404,
		readonly body: { readonly error: string },
	) {
		super(body.error);
	}
}

function handleCommandError(context: CommandContext, error: unknown) {
	if (error instanceof CommandError) {
		return context.json(error.body, error.status);
	}
	throw error;
}

type InvalidCommandBody = {
	readonly error: 'invalid_command';
	readonly message: string;
	readonly issues: readonly { readonly path: string; readonly message: string }[];
};

function createCommand<TCommand extends FieldWorkCommand>(
	build: () => TCommand,
):
	| { readonly ok: true; readonly command: TCommand }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	try {
		return { ok: true, command: build() };
	} catch (error) {
		if (error instanceof DomainValidationError) {
			return {
				ok: false,
				body: { error: 'invalid_command', message: error.message, issues: error.issues },
			};
		}
		throw error;
	}
}

function invalidUpdate(changeNoun: string): {
	readonly ok: false;
	readonly body: InvalidCommandBody;
} {
	const message = `At least one ${changeNoun} field must change.`;
	return {
		ok: false,
		body: { error: 'invalid_command', message, issues: [{ path: 'changes', message }] },
	};
}

function agencyCommandContext(authContext: AuthContext) {
	return {
		organizationId: authContext.organization.id,
		actorProfileId: authContext.profile.id,
	};
}

function readTarget(payload: Record<string, unknown>): {
	readonly type: never;
	readonly id: string;
} {
	return {
		type: (readText(payload.entityType) ?? '') as never,
		id: readText(payload.entityId) ?? '',
	};
}

function readItemMappings(
	value: unknown,
): readonly { readonly routeItemId: string; readonly assignmentItemId: string }[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.map((entry) => ({
		routeItemId: isRecord(entry) ? (readText(entry.routeItemId) ?? '') : '',
		assignmentItemId: isRecord(entry) ? (readText(entry.assignmentItemId) ?? '') : '',
	}));
}

function readStringArray(value: unknown): readonly string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === 'string')
		: [];
}

function localDateColumn(value: string) {
	return sql<Date>`${value}::date`;
}

function nowLocalDate(): string {
	return new Date().toISOString().slice(0, 10);
}

async function readCurrentTransactionId(trx: FieldWorkTransaction): Promise<number> {
	const result = await sql<{
		txid: string;
	}>`select pg_current_xact_id()::xid::text as txid`.execute(trx);
	const txid = result.rows[0]?.txid;
	if (txid === undefined) {
		throw new Error('Unable to read current transaction id.');
	}
	return Number.parseInt(txid, 10);
}

type JsonResult =
	| { readonly ok: true; readonly payload: Record<string, unknown> }
	| { readonly ok: false; readonly reason: string };

async function readJsonObject(request: {
	readonly json: () => Promise<unknown>;
}): Promise<JsonResult> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return { ok: false, reason: 'Request body must be JSON.' };
	}
	if (!isRecord(raw)) {
		return { ok: false, reason: 'Request body must be an object.' };
	}
	return { ok: true, payload: raw };
}

function readText(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function readNullableText(value: unknown): string | null {
	return readText(value);
}

function readDate(value: unknown): Date | null {
	if (typeof value !== 'string' && !(value instanceof Date)) {
		return null;
	}
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

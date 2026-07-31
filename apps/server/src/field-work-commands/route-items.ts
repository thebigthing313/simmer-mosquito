import {
	addRouteItemCommand,
	type FieldWorkCommand,
	type RouteItemPlacement,
	type RouteItemTarget,
	removeRouteItemCommand,
	toDbEntityType,
	updateRouteItemCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import {
	agencyCommandContext,
	applyPlacement,
	type CommandContext,
	createCommand,
	type FieldWorkDb,
	type FieldWorkTransaction,
	handleCommandError,
	type RouteOptions,
	readJsonObject,
	readNullableText,
	readTarget,
	readText,
	reindexItems,
	routeItemReturnColumns,
	routePlacementRef,
	type SafeRouteItem,
	softDelete,
	toSafeRouteItem,
	updateRow,
	writeCommands,
} from './shared.js';

// ===========================================================================
// Route items
// ===========================================================================

export function registerRouteItemRoutes(
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

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
import { readNullableText, readText } from '../command-payload.js';
import {
	applyPlacement,
	type CommandContext,
	commandActor,
	commandEndpoint,
	denyUnauthorizedCommands,
	type FieldWorkDb,
	type FieldWorkTransaction,
	handleCommandError,
	type RouteOptions,
	readTarget,
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
	app.post(
		'/field-work/route-items',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				addRouteItemCommand({
					...ctx,
					routeItemId: readText(payload.id) ?? '',
					routeId: readText(payload.routeId) ?? '',
					target: readTarget(payload) as RouteItemTarget,
					...(payload.placement === undefined
						? {}
						: { placement: payload.placement as RouteItemPlacement }),
					directionsToNextItem: readNullableText(payload.directionsToNextItem),
				}),
			run: (context, commands) => runRouteItemCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/field-work/route-items/:routeItemId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx, param }) =>
				updateRouteItemCommand({
					...ctx,
					routeItemId: param('routeItemId'),
					directionsToNextItem: readNullableText(payload.directionsToNextItem),
				}),
			run: (context, commands) => runRouteItemCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/field-work/route-items/:routeItemId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				removeRouteItemCommand({ ...ctx, routeItemId: param('routeItemId') }),
			run: (context, commands) => runRouteItemCommands(context, options.db, commands),
		}),
	);
}

async function runRouteItemCommands(
	context: CommandContext,
	db: FieldWorkDb,
	commands: readonly FieldWorkCommand[],
	createdStatus?: 201,
) {
	const denial = denyUnauthorizedCommands(context, commands);
	if (denial !== null) {
		return denial;
	}

	try {
		const result = await writeCommands(
			db,
			commandActor(context.get('authContext')),
			commands,
			writeRouteItemCommand,
		);
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

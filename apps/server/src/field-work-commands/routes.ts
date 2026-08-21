import { applyRecordDeletion } from '@simmer-mosquito/db';
import {
	createRouteCommand,
	deleteRouteCommand,
	type FieldWorkCommand,
	moveRouteItemsCommand,
	type RouteItemPlacement,
	updateRouteDetailsCommand,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { readText } from '../command-payload.js';
import { applyPlacement } from '../ordered-items.js';
import {
	type CommandContext,
	commandEndpoint,
	type FieldWorkDb,
	type FieldWorkTransaction,
	type RouteOptions,
	type RouteRow,
	readStringArray,
	reindexItems,
	routePlacementRef,
	routeReturnColumns,
	runCommands,
	softDelete,
	updateRow,
} from './shared.js';

// ===========================================================================
// Routes
// ===========================================================================

export function registerRouteRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post(
		'/field-work/routes',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx }) =>
				createRouteCommand({
					...ctx,
					routeId: readText(payload.id) ?? '',
					routeName: readText(payload.routeName) ?? '',
					routeType: (readText(payload.routeType) ?? '') as never,
				}),
			run: (context, commands) => runRouteCommands(context, options.db, commands, 201),
		}),
	);

	app.patch(
		'/field-work/routes/:routeId',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx, param }) =>
				updateRouteDetailsCommand({
					...ctx,
					routeId: param('routeId'),
					routeName: readText(payload.routeName) ?? '',
				}),
			run: (context, commands) => runRouteCommands(context, options.db, commands),
		}),
	);

	app.delete(
		'/field-work/routes/:routeId',
		options.authContextMiddleware,
		commandEndpoint({
			body: 'none',
			build: ({ agency: ctx, param }) =>
				deleteRouteCommand({
					...ctx,
					routeId: param('routeId'),
					acknowledgedRouteItemDeletion: true,
				}),
			run: (context, commands) => runRouteCommands(context, options.db, commands),
		}),
	);

	app.post(
		'/field-work/routes/:routeId/move-items',
		options.authContextMiddleware,
		commandEndpoint({
			build: ({ payload, agency: ctx, param }) =>
				moveRouteItemsCommand({
					...ctx,
					routeId: param('routeId'),
					routeItemIds: readStringArray(payload.routeItemIds),
					placement: payload.placement as RouteItemPlacement,
				}),
			run: (context, commands) => runRouteCommands(context, options.db, commands),
		}),
	);
}

async function runRouteCommands(
	context: CommandContext,
	db: FieldWorkDb,
	commands: readonly FieldWorkCommand[],
	createdStatus?: 201,
) {
	return runCommands(
		context,
		{ db, write: writeRouteCommand, notFound: 'route_not_found', key: 'route' },
		commands,
		createdStatus,
	);
}

export async function writeRouteCommand(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
): Promise<RouteRow | null> {
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
			return row;
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
			);
		case 'fieldWork.deleteRoute':
			await applyRecordDeletion(trx, {
				recordType: 'route',
				recordId: command.payload.routeId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
			return softDelete(
				trx,
				'routes',
				command.payload.routeId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				routeReturnColumns,
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
): Promise<RouteRow | null> {
	const row = await trx
		.selectFrom('routes')
		.select(routeReturnColumns)
		.where('id', '=', routeId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row ?? null;
}

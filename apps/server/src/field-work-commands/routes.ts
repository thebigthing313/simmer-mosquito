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
import {
	agencyCommandContext,
	applyPlacement,
	type CommandContext,
	commandActor,
	createCommand,
	denyUnauthorizedCommands,
	type FieldWorkDb,
	type FieldWorkTransaction,
	handleCommandError,
	type RouteOptions,
	readJsonObject,
	readStringArray,
	readText,
	reindexItems,
	routePlacementRef,
	routeReturnColumns,
	type SafeRoute,
	softDelete,
	toSafeRoute,
	updateRow,
	writeCommands,
} from './shared.js';

// ===========================================================================
// Routes
// ===========================================================================

export function registerRouteRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
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
	const denial = denyUnauthorizedCommands(context, commands);
	if (denial !== null) {
		return denial;
	}

	try {
		const result = await writeCommands(
			db,
			commandActor(context.get('authContext')),
			commands,
			writeRouteCommand,
		);
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

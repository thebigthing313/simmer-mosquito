import { applyRecordDeletion } from '@simmer-mosquito/db';
import type { FieldWorkCommand } from '@simmer-mosquito/domain';
import { moveItems } from '../../ordered-items.js';
import { returnColumns } from '../../return-columns.js';
import {
	type FieldWorkTransaction,
	type RouteRow,
	routePlacementRef,
	softDelete,
	updateRow,
} from './shared.js';

// ===========================================================================
// Routes
// ===========================================================================

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
				.returning(returnColumns.routes)
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
				returnColumns.routes,
			);
		case 'fieldWork.deleteRoute':
			await applyRecordDeletion(trx, {
				recordType: 'route',
				recordId: command.payload.routeId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				acknowledged: {
					acknowledgedRouteItemDeletion: command.payload.acknowledgedRouteItemDeletion,
				},
			});
			return softDelete(
				trx,
				'routes',
				command.payload.routeId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				returnColumns.routes,
			);
		case 'fieldWork.moveRouteItems': {
			await moveItems(
				trx,
				{
					table: 'route_items',
					parentColumn: 'route_id',
					parentId: command.payload.routeId,
					organizationId: command.payload.organizationId,
				},
				command.payload.routeItemIds,
				{
					kind: command.payload.placement.kind,
					refId: routePlacementRef(command.payload.placement),
				},
				command.payload.actorProfileId,
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
		.select(returnColumns.routes)
		.where('id', '=', routeId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row ?? null;
}

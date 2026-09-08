import { checkedValues } from '@simmer-mosquito/db';
import { type FieldWorkCommand, toDbEntityType } from '@simmer-mosquito/domain';
import { nextItemPosition } from '../../ordered-items.js';
import { returnColumns } from '../../return-columns.js';
import {
	type FieldWorkTransaction,
	type RouteItemRow,
	routePlacementRef,
	softDelete,
	updateRow,
} from './shared.js';

// ===========================================================================
// Route items
// ===========================================================================

export async function writeRouteItemCommand(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
): Promise<RouteItemRow | null> {
	switch (command.type) {
		case 'fieldWork.addRouteItem': {
			const position = await nextItemPosition(
				trx,
				{
					table: 'route_items',
					parentColumn: 'route_id',
					parentId: command.payload.routeId,
					organizationId: command.payload.organizationId,
				},
				command.payload.routeItemId,
				{
					kind: command.payload.placement.kind,
					refId: routePlacementRef(command.payload.placement),
				},
			);
			await trx
				.insertInto('route_items')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.routeItemId,
						organization_id: command.payload.organizationId,
						route_id: command.payload.routeId,
						entity_type: toDbEntityType(command.payload.target.type),
						entity_id: command.payload.target.id,
						position,
						directions_to_next_item: command.payload.directionsToNextItem,
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.execute();
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
				returnColumns.route_items,
			);
		case 'fieldWork.removeRouteItem':
			return softDelete(
				trx,
				'route_items',
				command.payload.routeItemId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				returnColumns.route_items,
			);
		default:
			throw new Error(`Unsupported route item command: ${command.type}`);
	}
}

async function loadRouteItem(
	trx: FieldWorkTransaction,
	routeItemId: string,
	organizationId: string,
): Promise<RouteItemRow | null> {
	const row = await trx
		.selectFrom('route_items')
		.select(returnColumns.route_items)
		.where('id', '=', routeItemId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row ?? null;
}

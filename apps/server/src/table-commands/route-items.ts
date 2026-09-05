/**
 * The `route_items` table, as commands.
 *
 * One stop on a standing itinerary. Polymorphic like `comments` and `tag_items` —
 * a stop points at a Habitat or a Trap through `entity_type`/`entity_id` — so it
 * reads its target the same way, and a Route's own `route_type` is what decides
 * which kind it may hold.
 *
 * Reordering is not here: see `routes.ts` for why a move is a command on the
 * route.
 *
 * ## `position` is not a field a client sets
 *
 * The server derives the new stop's position from `placement`, so `placement`
 * is an instruction rather than a column and the row's own `position` is
 * ignored. A
 * client may still send one — it has to hold a value for the row it drew
 * optimistically — and it is simply not read.
 *
 * ## Field names
 *
 * Postgres column names: `route_id`, `entity_type`, `entity_id`,
 * `directions_to_next_item`.
 */

import {
	addRouteItemCommand,
	type FieldWorkCommand,
	type RouteItemPlacement,
	type RouteItemTarget,
	removeRouteItemCommand,
	updateRouteItemCommand,
} from '@simmer-mosquito/domain';
import { readNullableText, readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { writeRouteItemCommand } from '../field-work-commands/route-items.js';
import type { RouteItemRow } from '../field-work-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { readEntityTarget } from './shared.js';

/**
 * Where in the route a stop goes. Not a column: the order is a list, not a field.
 */
type RouteItemArgument = 'placement';

export function routeItemTableCommands(
	db: CommandDb,
): TableCommands<'route_items', FieldWorkCommand, RouteItemRow, RouteItemArgument> {
	return {
		table: 'route_items',
		run: { db, write: writeRouteItemCommand, notFound: 'route_item_not_found', key: 'routeItem' },
		intents: {
			'fieldWork.addRouteItem': ({ payload, organization, id }) =>
				addRouteItemCommand({
					...organization,
					routeItemId: id,
					routeId: readText(payload.route_id) ?? '',
					target: readEntityTarget(payload.entity_type, payload.entity_id) as RouteItemTarget,
					// Absent means append, which is what the domain defaults to. Sending
					// `placement: undefined` would say the same thing; leaving the key out
					// keeps the builder's own default the only place that decision is made.
					...(payload.placement === undefined
						? {}
						: { placement: payload.placement as RouteItemPlacement }),
					directionsToNextItem: readNullableText(payload.directions_to_next_item),
				}),

			'fieldWork.updateRouteItem': ({ payload, organization, id }) =>
				updateRouteItemCommand({
					...organization,
					routeItemId: id,
					directionsToNextItem: readNullableText(payload.directions_to_next_item),
				}),

			// No acknowledgement: a stop holds nothing of its own, so dropping one takes
			// nothing with it. The gap it leaves in `position` stays there.
			'fieldWork.removeRouteItem': ({ organization, id }) =>
				removeRouteItemCommand({ ...organization, routeItemId: id }),
		},
	};
}

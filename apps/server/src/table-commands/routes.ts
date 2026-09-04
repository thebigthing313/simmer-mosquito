/**
 * The `routes` table, as commands.
 *
 * A Route is a standing itinerary — the stops a technician walks, in order,
 * reused week after week. The route row itself carries almost nothing: a name and
 * which kind of stop it takes. Everything else about it is in `route_items`.
 *
 * ## Why the move lives here and not on the items
 *
 * `fieldWork.moveRouteItems` restacks the items, so the obvious home is
 * `route_items`. It is here because `position` belongs to the *sequence* rather
 * than to any row in it: a move takes an id list and a placement, resolves the
 * order the route holds, and the row it answers with is the route. Posting that
 * to the child table would mean a request whose path names one item while its
 * body restacks the list around it.
 *
 * It is a PATCH on the route, which is also what makes it reachable: the dispatch
 * gives each table a POST, a PATCH and a DELETE, and the move is the only command
 * of the four that names an existing route without changing a column on it.
 *
 * ## Field names
 *
 * Postgres column names: `route_name`, `route_type`. `route_item_ids` and
 * `placement` are neither — a move states a sequence, and nothing about it is
 * stored on the route.
 */

import {
	createRouteCommand,
	deleteRouteCommand,
	type FieldWorkCommand,
	moveRouteItemsCommand,
	type RouteItemPlacement,
	updateRouteDetailsCommand,
} from '@simmer-mosquito/domain';
import { readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { readStringArray } from '../command-write.js';
import { writeRouteCommand } from '../field-work-commands/routes.js';
import type { RouteRow } from '../field-work-commands/shared.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

/**
 * The stops a move plan names, and where it puts them. The ids are
 * `route_items.id`, so they stay `snake_case`.
 */
type RouteArgument = 'route_item_ids' | 'placement';

export function routeTableCommands(
	db: CommandDb,
): TableCommands<'routes', FieldWorkCommand, RouteRow, RouteArgument> {
	return {
		table: 'routes',
		run: { db, write: writeRouteCommand, notFound: 'route_not_found', key: 'route' },
		intents: {
			// `route_type` decides which records the route may hold and cannot be
			// changed afterwards, which is why only the create reads it.
			'fieldWork.createRoute': ({ payload, agency, id }) =>
				createRouteCommand({
					...agency,
					routeId: id,
					routeName: readText(payload.route_name) ?? '',
					routeType: (readText(payload.route_type) ?? '') as never,
				}),

			'fieldWork.updateRouteDetails': ({ payload, agency, id }) =>
				updateRouteDetailsCommand({
					...agency,
					routeId: id,
					routeName: readText(payload.route_name) ?? '',
				}),

			// Deleting a route deletes its stops with it. The acknowledgement is how a
			// client says it has told the user so.
			'fieldWork.deleteRoute': ({ payload, agency, id }) =>
				deleteRouteCommand({
					...agency,
					routeId: id,
					acknowledgedRouteItemDeletion: acknowledged(payload, 'acknowledgedRouteItemDeletion'),
				}),

			'fieldWork.moveRouteItems': ({ payload, agency, id }) =>
				moveRouteItemsCommand({
					...agency,
					routeId: id,
					routeItemIds: readStringArray(payload.route_item_ids),
					// Untyped, as the location sources are: which placements are legal is
					// the domain builder's rule, and restating it here would be a copy of
					// it that could disagree.
					placement: payload.placement as RouteItemPlacement,
				}),
		},
	};
}

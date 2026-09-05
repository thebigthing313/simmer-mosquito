/**
 * The standing Routes a record is a stop on.
 *
 * `docs/sync.md` notes that the same Habitat may appear in several Routes, which
 * is exactly why a detail page should say so: a crew lead looking at a site needs
 * to know whose run it is already on before adding it to another, and the only
 * other way to find out is to open every Route.
 *
 * One query where the page ran two — the stops, then the whole `routes` catalog
 * to name them. The join asks for the handful of routes the stops actually name.
 *
 * `route_items` is on-demand, so this is a plain `useLiveQuery` gated on status
 * rather than the suspense hook, which sticks permanently after an unmount over
 * an on-demand collection.
 */

import type { RouteType } from '@simmer-mosquito/domain';
import { and, coalesce, eq, useLiveQuery } from '@tanstack/react-db';
import { route_items } from '../../lib/collections/route_items';
import { routes } from '../../lib/collections/routes';

// Keep the record's stops warm briefly after unmount, so paging through a list of
// habitats does not re-fetch the same subset on every card.
const routeItemsGcTimeMs = 30_000;

/** One line of "this site is stop 4 of Zone 3". */
export interface RecordRoute {
	readonly routeItemId: string;
	readonly routeId: string;
	readonly routeName: string;
	/** The stored sort key, which can have gaps — not the ordinal a crew reads. */
	readonly position: number;
}

export interface RecordRoutesResult {
	readonly routes: readonly RecordRoute[];
	readonly isReady: boolean;
	readonly isError: boolean;
}

export function useRecordRoutes(target: {
	readonly type: RouteType;
	readonly id: string;
}): RecordRoutesResult {
	const result = useLiveQuery(
		{
			gcTime: routeItemsGcTimeMs,
			query: (query) =>
				query
					.from({ item: route_items() })
					.where(({ item }) =>
						and(eq(item.entity_type, target.type), eq(item.entity_id, target.id)),
					)
					// `inner`, and passed rather than left to the default, which is `left`:
					// a stop whose Route this client does not hold has no name to draw, and
					// the line is a link, so drawing it unnamed offers a page that is not
					// there.
					.join({ route: routes() }, ({ item, route }) => eq(item.route_id, route.id), 'inner')
					.orderBy(({ route }) => route.route_name, 'asc')
					.select(({ item, route }) => ({
						routeItemId: item.id,
						// The stop's own column rather than the joined row's id. They are the
						// same value under this join, and this one is typed as present: the
						// builder types a joined column as possibly absent whatever the join
						// kind, because one set of types describes `left` and `inner` alike.
						routeId: item.route_id,
						// The `coalesce` is what makes this compile, not a fallback the engine
						// reaches. `RecordRoute.routeName` is a `string` and the joined column
						// is typed wider, so deleting it fails `tsc`. An `inner` join emits
						// only matched pairs, so the empty string never reaches a row.
						routeName: coalesce(route.route_name, ''),
						position: item.position,
					})),
		},
		[target.type, target.id],
	);

	return { routes: result.data, isReady: result.isReady, isError: result.isError };
}

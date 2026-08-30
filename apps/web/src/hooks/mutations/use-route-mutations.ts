/**
 * Creating, renaming, deleting and reordering a standing Route.
 *
 * Habitat routes and trap routes are the same two tables — a `routes` row with a
 * `route_type`, and `route_items` pointing at Habitats or Traps — so both
 * planning surfaces write through this one hook and pass their own type.
 *
 * ## Reordering is a command on the Route
 *
 * A move restacks the stops, but `position` belongs to the sequence rather than
 * to any row in it: the server takes a declarative placement, resolves the live
 * order and writes the moved rows inside one transaction. So the request is a
 * PATCH on the route, and the optimistic half is an update per moved stop in
 * `route_items`, which is exactly the shape `commandTransaction` exists for and
 * why `fieldWork.moveRouteItems` is a compile error in `mutateCollection`.
 *
 * The client runs the server's arithmetic through `planStopPositions` rather
 * than numbering the list itself, so the rows it writes and the rows that stream
 * back carry the same values and nothing moves twice on screen.
 *
 * **An empty `apply` would send nothing at all.** TanStack DB completes a
 * transaction with no mutations without ever calling its `mutationFn`: no
 * request, no error, `isPersisted` resolved. A move that wrote no rows would
 * therefore look like a success and change nothing, which is why a move rewrites
 * the row it moved even when the order it resolves to is the order the list is
 * already in.
 */

import type { MultiRowCommandType } from '@simmer-mosquito/domain';
import { type Route as RouteRow, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { type MovePlan, planStopPositions } from '../../components/stop-order';
import { mutateCollection } from '../../lib/collections/mutate';
import { route_items } from '../../lib/collections/route_items';
import { routes } from '../../lib/collections/routes';
import { commandTransaction } from '../../lib/collections/transact';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { newRecordId, optimisticStamp } from './shared';

export type RouteType = RouteRow['route_type'];

export interface RouteMutations {
	/** Returns the new route's id — the create dialog hands straight off to its edit page. */
	readonly create: (input: {
		readonly routeName: string;
		readonly routeType: RouteType;
	}) => Promise<string>;
	readonly rename: (routeId: string, routeName: string) => Promise<void>;
	/**
	 * Takes the route's stops with it. The records those stops pointed at are
	 * untouched.
	 *
	 * `acknowledgements` is what the user answered. Withheld flags go on the wire
	 * as `false`, which is the only reading that makes the registry refuse.
	 */
	readonly remove: (
		routeId: string,
		acknowledgements?: Readonly<Record<string, boolean>>,
	) => Promise<void>;
	readonly moveStops: (routeId: string, plan: MovePlan) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

/**
 * The anchor, renamed for the wire.
 *
 * The shared planner calls it `anchorId` so it can order mission items and
 * assignment stops with the same code; each command names the table it moves.
 */
function routePlacement(placement: MovePlan['placement']): Record<string, unknown> {
	return placement.kind === 'before' || placement.kind === 'after'
		? { kind: placement.kind, routeItemId: placement.anchorId }
		: { kind: placement.kind };
}

export function useRouteMutations(): RouteMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const create = useCallback(
		async ({
			routeName,
			routeType,
		}: {
			readonly routeName: string;
			readonly routeType: RouteType;
		}) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}

			const now = optimisticStamp();
			const routeId = newRecordId();
			await settleWrite(
				mutateCollection(routes, {
					operation: 'insert',
					intent: 'fieldWork.createRoute',
					row: {
						id: routeId,
						organization_id: organizationId,
						route_name: routeName,
						route_type: routeType,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies RouteRow,
				}),
			);
			return routeId;
		},
		[organizationId, actorProfileId],
	);

	const rename = useCallback(
		async (routeId: string, routeName: string) => {
			await settleWrite(
				mutateCollection(routes, {
					operation: 'update',
					intent: 'fieldWork.updateRouteDetails',
					key: routeId,
					changes: {
						route_name: routeName,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(
		async (routeId: string, acknowledgements: Readonly<Record<string, boolean>> = {}) => {
			await settleWrite(
				mutateCollection(routes, {
					operation: 'delete',
					intent: 'fieldWork.deleteRoute',
					key: routeId,
					// A delete carries no row and no changed fields, so an acknowledgement
					// is the only thing it can say beyond the command's name.
					acknowledgements,
				}),
			);
		},
		[],
	);

	const moveStops = useCallback(async (routeId: string, plan: MovePlan) => {
		await settleWrite(
			commandTransaction({
				intent: 'fieldWork.moveRouteItems' satisfies MultiRowCommandType,
				request: {
					table: 'routes',
					method: 'PATCH',
					key: routeId,
					body: {
						// One id: the planner moves a single stop per action. The command
						// takes a list because the same endpoint restacks a selection.
						route_item_ids: [plan.movedId],
						placement: routePlacement(plan.placement),
					},
				},
				// The same arithmetic the server runs, so the optimistic rows carry the
				// numbers that stream back and nothing shifts twice on screen. An empty
				// `apply` would be worse than useless: TanStack DB completes a
				// transaction with no mutations without calling its `mutationFn`, so the
				// request would never leave the browser. A move always rewrites at least
				// the row it moved, which is why that cannot happen here.
				apply: () => {
					const positions = planStopPositions(plan, (id) => route_items.get(id)?.position);
					for (const [routeItemId, position] of positions) {
						route_items.update(routeItemId, (draft) => {
							draft.position = position;
						});
					}
				},
			}),
		);
	}, []);

	return {
		create,
		rename,
		remove,
		moveStops,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}

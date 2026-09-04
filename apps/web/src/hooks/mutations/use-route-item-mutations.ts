/**
 * Adding, annotating and removing one stop on a Route.
 *
 * Polymorphic like the crew and comment rows: a stop points at a Habitat or a
 * Trap through `entity_type`/`entity_id`, and the column's snake_case spelling is
 * what is written here so the optimistic row and the synced one are the same row.
 * Both target types are single words, so nothing looks wrong until the day a
 * two-word one is added — see `use-additional-personnel-mutations.ts`.
 *
 * Reordering is not here: it restacks the sequence and is a command on the
 * Route, in `use-route-mutations.ts`.
 *
 * ## `position` on a new stop
 *
 * The add carries no placement, so the server appends: it writes one row at the
 * list's current maximum plus one and leaves every sibling alone. The caller
 * passes its own last position plus one, which is the same number.
 */

import { type RouteItem as RouteItemRow, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { mutateCollection } from '../../lib/collections/mutate';
import { route_items } from '../../lib/collections/route_items';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { newRecordId, optimisticStamp } from './shared';

/** The record a stop sends a crew to. */
export interface RouteStopTarget {
	readonly type: 'habitat' | 'trap';
	readonly id: string;
}

export interface RouteItemMutations {
	readonly addStop: (input: {
		readonly routeId: string;
		readonly target: RouteStopTarget;
		/** The list's current last, plus one, which is what the server's append writes. */
		readonly position: number;
	}) => Promise<void>;
	/** What a crew needs between this stop and the next. Empty clears it. */
	readonly setDirections: (routeItemId: string, directions: string) => Promise<void>;
	readonly removeStop: (routeItemId: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useRouteItemMutations(): RouteItemMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const addStop = useCallback(
		async ({
			routeId,
			target,
			position,
		}: {
			readonly routeId: string;
			readonly target: RouteStopTarget;
			readonly position: number;
		}) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}

			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(route_items(), {
					operation: 'insert',
					intent: 'fieldWork.addRouteItem',
					row: {
						id: newRecordId(),
						organization_id: organizationId,
						route_id: routeId,
						entity_type: target.type,
						entity_id: target.id,
						position,
						directions_to_next_item: null,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies RouteItemRow,
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const setDirections = useCallback(
		async (routeItemId: string, directions: string) => {
			const trimmed = directions.trim();
			await settleWrite(
				mutateCollection(route_items(), {
					operation: 'update',
					intent: 'fieldWork.updateRouteItem',
					key: routeItemId,
					changes: {
						directions_to_next_item: trimmed.length === 0 ? null : trimmed,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const removeStop = useCallback(async (routeItemId: string) => {
		await settleWrite(
			mutateCollection(route_items(), {
				operation: 'delete',
				intent: 'fieldWork.removeRouteItem',
				key: routeItemId,
			}),
		);
	}, []);

	return {
		addStop,
		setDirections,
		removeStop,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}

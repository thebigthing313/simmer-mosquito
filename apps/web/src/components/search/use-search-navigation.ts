import { type SearchResult, searchResultValue } from '@simmer-mosquito/domain';
import { useLiveQuery } from '@tanstack/react-db';
import { useEffect, useState } from 'react';
import { routes as routesCollection } from '../../lib/collections/routes';
import {
	type DestinationResolution,
	type RouteTypeIndex,
	type SearchDestination,
	searchResultDestination,
} from './search-destinations';

/**
 * The one place the `routes` collection is read for a route type.
 *
 * Both result surfaces call this rather than each building their own lookup, so
 * the readiness rule exists once. Readiness comes from the live query's own
 * status: an empty collection and a collection still loading are different
 * things, and reading the row count cannot tell them apart.
 */
export function useRouteTypeIndex(): RouteTypeIndex {
	const lookup = useLiveQuery((builder) => builder.from({ row: routesCollection() }), []);

	if (!lookup.isReady) {
		return { status: 'loading' };
	}

	const rows = lookup.data ?? [];
	return {
		status: 'ready',
		routeTypeOf: (routeId) => rows.find((row) => row.id === routeId)?.route_type,
	};
}

export interface DeferredOpen {
	/** Opens the row now if it resolves, and waits on it if it does not resolve yet. */
	readonly select: (result: SearchResult) => void;
	/** The row value waiting on a lookup, which the list draws as pending. */
	readonly waitingValue: string | undefined;
	/** Drops the wait, for a surface the reader has dismissed. */
	readonly cancel: () => void;
}

/**
 * The whole readiness path for a surface whose rows are records and comments.
 *
 * The results page has nothing else on its list, so it takes this rather than
 * the two halves. The palette matches pages and actions against the shell's own
 * navigation as well, and resolves those before this map is reached, so it wires
 * the halves itself.
 */
export function useSearchResultOpen(open: (destination: SearchDestination) => void): DeferredOpen {
	const routeTypes = useRouteTypeIndex();
	return useDeferredOpen((result) => searchResultDestination(result, routeTypes), open);
}

/**
 * Selecting a row that does not resolve yet, without the click going nowhere.
 *
 * A route comment selected before the `routes` collection lands has no
 * destination to navigate to. Dropping the click would read as broken, so the
 * row is held and opened as soon as the lookup answers. A row that resolves to
 * nothing once the lookup has answered clears the wait, because there is nothing
 * left to wait for.
 */
export function useDeferredOpen<TDestination>(
	resolve: (result: SearchResult) => DestinationResolution<TDestination>,
	open: (destination: TDestination) => void,
): DeferredOpen {
	const [waiting, setWaiting] = useState<SearchResult | undefined>(undefined);

	const held = waiting === undefined ? undefined : resolve(waiting);

	// `open` navigates, so it runs in an effect rather than during the render that
	// noticed the lookup had answered.
	// biome-ignore lint/correctness/useExhaustiveDependencies: `open` and `resolve` are fresh closures every render and re-running on them would loop
	useEffect(() => {
		if (held === undefined || held.status === 'pending') {
			return;
		}

		setWaiting(undefined);
		if (held.status === 'ready') {
			open(held.destination);
		}
	}, [held]);

	return {
		waitingValue: waiting === undefined ? undefined : searchResultValue(waiting),
		cancel: () => setWaiting(undefined),
		select: (result) => {
			const resolution = resolve(result);
			if (resolution.status === 'ready') {
				open(resolution.destination);
				return;
			}

			setWaiting(resolution.status === 'pending' ? result : undefined);
		},
	};
}

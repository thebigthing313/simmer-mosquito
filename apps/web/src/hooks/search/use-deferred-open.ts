import { type SearchResult, searchResultValue } from '@simmer-mosquito/domain';
import { useEffect, useEffectEvent, useState } from 'react';
import type { DestinationResolution } from '../../components/search/search-destinations';

export interface DeferredOpen {
	/** Opens the row now if it resolves, and waits on it if it does not resolve yet. */
	readonly select: (result: SearchResult) => void;
	/** The row value waiting on a lookup, which the list draws as pending. */
	readonly waitingValue: string | undefined;
	/** Drops the wait, for a surface the reader has dismissed. */
	readonly cancel: () => void;
}

/**
 * Opens a selected search result, holding one whose destination is still
 * pending until `resolve` answers. A row that resolves to nothing once the
 * lookup has answered clears the wait.
 */
export function useDeferredOpen<TDestination>(
	resolve: (result: SearchResult) => DestinationResolution<TDestination>,
	open: (destination: TDestination) => void,
): DeferredOpen {
	const [waiting, setWaiting] = useState<SearchResult | undefined>(undefined);

	const held = waiting === undefined ? undefined : resolve(waiting);

	// `open` navigates, so it runs in an effect rather than during the render that
	// noticed the lookup had answered. It is a fresh closure every render and the
	// effect must not re-run on it, which is what `useEffectEvent` is for.
	const openHeld = useEffectEvent((destination: TDestination) => {
		open(destination);
	});

	useEffect(() => {
		if (held === undefined || held.status === 'pending') {
			return;
		}

		setWaiting(undefined);
		if (held.status === 'ready') {
			openHeld(held.destination);
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

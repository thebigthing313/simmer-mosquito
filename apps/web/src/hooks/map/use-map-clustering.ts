import { useSyncExternalStore } from 'react';
import { mapClustering } from '../../lib/map-clustering';

/**
 * Whether the maps draw clusters, and the setter, read from the one setting
 * every map shares. A switch on one map is the value on every other.
 */
export function useMapClustering(): readonly [boolean, (on: boolean) => void] {
	const on = useSyncExternalStore(mapClustering.subscribe, mapClustering.read, mapClustering.read);
	return [on, mapClustering.write];
}

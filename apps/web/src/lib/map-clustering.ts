/**
 * Whether the maps draw clusters, one setting for every map page.
 *
 * The value lives in a {@link MapClusteringStorage}, and `mapClustering` at the
 * bottom of this module is the one place a storage is chosen. Today that is
 * memory, so the setting holds for the visit and a reload starts on again;
 * keeping it across visits is a different storage at that one line.
 */

/** Where the setting is kept between reads. */
export interface MapClusteringStorage {
	/** The stored value, or `undefined` when nothing is stored. */
	read(): boolean | undefined;
	write(on: boolean): void;
}

/** The setting as a store a hook can subscribe to. */
export interface MapClusteringSetting {
	read(): boolean;
	write(on: boolean): void;
	/** Listen for changes, until the returned function takes the listener off. */
	subscribe(listener: () => void): () => void;
}

/** Clustering is on until somebody turns it off. */
const CLUSTERING_DEFAULT = true;

/** A storage that holds the value for as long as the page does. */
export function memoryClusteringStorage(): MapClusteringStorage {
	let stored: boolean | undefined;
	return {
		read: () => stored,
		write: (on) => {
			stored = on;
		},
	};
}

/**
 * The setting over a storage: on unless the storage holds a value, written
 * through to it, and heard by every subscriber when it changes.
 */
export function createMapClusteringSetting(storage: MapClusteringStorage): MapClusteringSetting {
	let value = storage.read() ?? CLUSTERING_DEFAULT;
	const listeners = new Set<() => void>();
	return {
		read: () => value,
		write: (on) => {
			if (on === value) {
				return;
			}
			value = on;
			storage.write(on);
			for (const listener of [...listeners]) {
				listener();
			}
		},
		subscribe: (listener) => {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

/** The setting every map reads. */
export const mapClustering = createMapClusteringSetting(memoryClusteringStorage());

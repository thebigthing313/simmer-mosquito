/**
 * Whether the maps draw clusters, one setting for every map page.
 *
 * The value lives in a {@link MapClusteringStorage}, and `mapClustering` at the
 * bottom of this module is the one place a storage is chosen. That is this
 * browser's storage, under one key and not keyed by Organization, because
 * whether a person wants clusters is a habit of theirs and not a fact about a
 * place. A reload opens on the choice the last visit left.
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

/** The one key the choice is stored under, for every Organization. */
export const MAP_CLUSTERING_KEY = 'simmer.map.clustering';

const STORED_ON = 'on';
const STORED_OFF = 'off';

/**
 * A storage in this browser. Every read and write is guarded, since a private
 * window or a blocked site throws on access: a store that refuses, an empty
 * one, or a value it does not know reads as nothing, so the maps open on, and
 * a write it refuses leaves the choice in memory for the visit.
 */
export function browserClusteringStorage(): MapClusteringStorage {
	return { read: readStoredClustering, write: writeStoredClustering };
}

function readStoredClustering(): boolean | undefined {
	try {
		const raw = globalThis.localStorage?.getItem(MAP_CLUSTERING_KEY);
		return raw === STORED_ON ? true : raw === STORED_OFF ? false : undefined;
	} catch {
		return undefined;
	}
}

function writeStoredClustering(on: boolean): void {
	try {
		globalThis.localStorage?.setItem(MAP_CLUSTERING_KEY, on ? STORED_ON : STORED_OFF);
	} catch {
		// The choice holds for this visit only, which the setting already keeps.
	}
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
export const mapClustering = createMapClusteringSetting(browserClusteringStorage());

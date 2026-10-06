/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	browserClusteringStorage,
	createMapClusteringSetting,
	MAP_CLUSTERING_KEY,
	type MapClusteringStorage,
	memoryClusteringStorage,
} from '../../../lib/map-clustering';

afterEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
	vi.resetModules();
});

function blockStorage() {
	vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
		throw new Error('blocked');
	});
	vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
		throw new Error('blocked');
	});
}

describe('map clustering setting', () => {
	it('starts on when nothing is stored', () => {
		const setting = createMapClusteringSetting(memoryClusteringStorage());

		expect(setting.read()).toBe(true);
	});

	it('starts on what the storage holds', () => {
		const storage: MapClusteringStorage = { read: () => false, write: () => {} };

		expect(createMapClusteringSetting(storage).read()).toBe(false);
	});

	it('writes through to the storage and tells every subscriber', () => {
		const written: boolean[] = [];
		const setting = createMapClusteringSetting({
			read: () => undefined,
			write: (on) => written.push(on),
		});
		let heard = 0;
		const release = setting.subscribe(() => {
			heard += 1;
		});

		setting.write(false);
		expect(setting.read()).toBe(false);
		expect(written).toEqual([false]);
		expect(heard).toBe(1);

		release();
		setting.write(true);
		expect(setting.read()).toBe(true);
		expect(heard).toBe(1);
	});

	it('says nothing when the value does not change', () => {
		const written: boolean[] = [];
		const setting = createMapClusteringSetting({
			read: () => undefined,
			write: (on) => written.push(on),
		});
		let heard = 0;
		setting.subscribe(() => {
			heard += 1;
		});

		setting.write(true);

		expect(written).toEqual([]);
		expect(heard).toBe(0);
	});

	it('keeps a memory value for as long as the storage lives', () => {
		const storage = memoryClusteringStorage();
		createMapClusteringSetting(storage).write(false);

		expect(createMapClusteringSetting(storage).read()).toBe(false);
	});
});

describe('map clustering in browser storage (issue #1381)', () => {
	it('reads nothing from an empty store', () => {
		expect(browserClusteringStorage().read()).toBeUndefined();
	});

	it('reads back each value it wrote, under the one key', () => {
		const storage = browserClusteringStorage();

		storage.write(false);
		expect(storage.read()).toBe(false);
		expect(localStorage.length).toBe(1);
		expect(localStorage.getItem(MAP_CLUSTERING_KEY)).not.toBeNull();

		storage.write(true);
		expect(storage.read()).toBe(true);
		expect(localStorage.length).toBe(1);
	});

	it('reads a value it does not know as nothing', () => {
		for (const stored of ['', 'maybe', 'false', '0', 'null', 'OFF']) {
			localStorage.setItem(MAP_CLUSTERING_KEY, stored);
			expect(browserClusteringStorage().read()).toBeUndefined();
		}
	});

	it('reads and writes nothing, without throwing, when the store refuses', () => {
		blockStorage();
		const storage = browserClusteringStorage();

		expect(() => storage.write(false)).not.toThrow();
		expect(storage.read()).toBeUndefined();
	});

	it('opens on over a blocked store and still switches for the visit', () => {
		blockStorage();
		const setting = createMapClusteringSetting(browserClusteringStorage());

		expect(setting.read()).toBe(true);
		setting.write(false);
		expect(setting.read()).toBe(false);
	});

	it('opens on over an unknown value', () => {
		localStorage.setItem(MAP_CLUSTERING_KEY, 'maybe');

		expect(createMapClusteringSetting(browserClusteringStorage()).read()).toBe(true);
	});

	it('opens a reloaded page on the choice the last one stored', async () => {
		const first = await import('../../../lib/map-clustering');
		first.mapClustering.write(false);

		vi.resetModules();
		const reloaded = await import('../../../lib/map-clustering');
		expect(reloaded.mapClustering.read()).toBe(false);

		reloaded.mapClustering.write(true);
		vi.resetModules();
		const again = await import('../../../lib/map-clustering');
		expect(again.mapClustering.read()).toBe(true);
	});
});

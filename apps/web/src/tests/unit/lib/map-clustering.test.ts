import { describe, expect, it } from 'vitest';
import {
	createMapClusteringSetting,
	type MapClusteringStorage,
	memoryClusteringStorage,
} from '../../../lib/map-clustering';

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

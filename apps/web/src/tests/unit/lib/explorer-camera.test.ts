/** @vitest-environment jsdom */

/**
 * The one explorer camera, as browser storage holds it. A stored value is
 * input, so anything that is not a camera the map can open on reads as none,
 * and a store that throws reads and writes as none rather than failing the map.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	explorerCameraKey,
	readExplorerCamera,
	writeExplorerCamera,
} from '../../../lib/explorer-camera';

const KEY = explorerCameraKey('org-1');
const CAMERA = { center: [-74.2, 40.1] as [number, number], zoom: 11.5, bearing: 12, pitch: 30 };

afterEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
});

describe('the explorer camera', () => {
	it('reads back the camera it wrote, under the Organization it was written for', () => {
		writeExplorerCamera(KEY, CAMERA);

		expect(readExplorerCamera(KEY)).toEqual(CAMERA);
		expect(readExplorerCamera(explorerCameraKey('org-2'))).toBeUndefined();
	});

	it('reads a value that is not a camera as none', () => {
		for (const stored of [
			'not json',
			'null',
			'{"center":[-74,40],"zoom":11}',
			'{"center":[-200,40],"zoom":11,"bearing":0,"pitch":0}',
			'{"center":[-74,40],"zoom":"11","bearing":0,"pitch":0}',
			'{"center":[-74],"zoom":11,"bearing":0,"pitch":0}',
		]) {
			localStorage.setItem(KEY, stored);
			expect(readExplorerCamera(KEY)).toBeUndefined();
		}
	});

	it('reads and writes nothing, without throwing, when the store refuses', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('blocked');
		});

		expect(() => writeExplorerCamera(KEY, CAMERA)).not.toThrow();
		expect(readExplorerCamera(KEY)).toBeUndefined();
	});
});

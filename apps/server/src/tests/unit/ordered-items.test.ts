/**
 * Which order a placement resolves to.
 *
 * `applyPlacement` is the only ordering decision this app makes on its own: the
 * position arithmetic is `planItemPositions` in `packages/domain`, tested
 * beside it, and the database half, that the neighbours are the right rows and
 * that no sibling is touched, is in
 * `tests/integration/ordered-items.integration.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { applyPlacement } from '../../ordered-items.js';

describe('applyPlacement', () => {
	it('puts a new id where its placement asks', () => {
		const list = ['a', 'b', 'c'];
		expect(applyPlacement([...list, 'n'], ['n'], 'start', null)).toEqual(['n', 'a', 'b', 'c']);
		expect(applyPlacement([...list, 'n'], ['n'], 'end', null)).toEqual(['a', 'b', 'c', 'n']);
		expect(applyPlacement([...list, 'n'], ['n'], 'before', 'b')).toEqual(['a', 'n', 'b', 'c']);
		expect(applyPlacement([...list, 'n'], ['n'], 'after', 'b')).toEqual(['a', 'b', 'n', 'c']);
	});

	it('falls through to the end when the reference is gone', () => {
		// A removed stop is a placement reference a client can still hold.
		expect(applyPlacement(['a', 'b', 'n'], ['n'], 'after', 'deleted')).toEqual(['a', 'b', 'n']);
	});
});

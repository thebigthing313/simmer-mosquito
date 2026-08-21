/**
 * Where a new stop lands, as arithmetic.
 *
 * `positionBetween` is the whole of the add path's ordering decision: the
 * neighbours come from a query, and everything that could be wrong about the
 * number written is here. The database half, that the neighbours are the right
 * two rows and that no sibling is touched, is in
 * `tests/integration/ordered-items.integration.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { applyPlacement, positionBetween } from '../../ordered-items.js';

describe('positionBetween', () => {
	it('starts an empty list at zero', () => {
		expect(positionBetween(null, null)).toBe(0);
	});

	it('lands strictly between two neighbours', () => {
		expect(positionBetween(1, 2)).toBe(1.5);
		expect(positionBetween(0, 1)).toBe(0.5);
	});

	it('lands past the end when there is nothing after', () => {
		expect(positionBetween(4, null)).toBe(5);
	});

	it('halves a positive first position', () => {
		expect(positionBetween(null, 2)).toBe(1);
	});

	it('steps below a first position that halving would not clear', () => {
		// Rows written under the old integer scheme start at zero, and half of zero
		// is zero. A head insert has to step down or it ties with the row it is
		// meant to precede.
		expect(positionBetween(null, 0)).toBe(-1);
		expect(positionBetween(null, -3)).toBe(-4);
	});

	it('keeps subdividing the same gap', () => {
		let after = 1;
		for (let insert = 0; insert < 20; insert += 1) {
			const next = positionBetween(0, after);
			expect(next).toBeGreaterThan(0);
			expect(next).toBeLessThan(after);
			after = next;
		}
	});
});

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

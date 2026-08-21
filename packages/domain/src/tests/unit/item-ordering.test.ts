/**
 * Where a stop lands, as arithmetic.
 *
 * `positionBetween` is the whole of the add path's ordering decision, and
 * `planItemPositions` is the whole of the move's: the neighbours come from a
 * query, and everything that could be wrong about the numbers written is here.
 * The database half, that the neighbours are the right rows and that no sibling
 * is touched, is in
 * `apps/server/src/tests/integration/ordered-items.integration.test.ts`.
 */

import { describe, expect, it } from 'vitest';
import { type ItemPositions, planItemPositions, positionBetween } from '../../item-ordering.js';

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

/** Four stops numbered the way rows written under the old integer scheme are. */
function contiguous(ids: readonly string[]): ItemPositions {
	return new Map(ids.map((id, index) => [id, index]));
}

/** The order `positions` reads back in, which is what a client actually sees. */
function readBack(positions: ItemPositions): readonly string[] {
	return [...positions.entries()].sort((first, second) => first[1] - second[1]).map(([id]) => id);
}

describe('planItemPositions', () => {
	const ids = ['a', 'b', 'c', 'd'];

	it('writes one row for a one-stop move', () => {
		const plan = planItemPositions(['a', 'c', 'b', 'd'], contiguous(ids), ['c']);
		expect(plan.normalized).toBe(false);
		expect([...plan.positions.keys()]).toEqual(['c']);
		// Between a and b, the two it now sits between. Nothing else is written.
		expect(plan.positions.get('c')).toBe(0.5);
	});

	it('writes one row per moved id and leaves the rest alone', () => {
		const plan = planItemPositions(['a', 'c', 'd', 'b'], contiguous(ids), ['c', 'd']);
		expect(plan.normalized).toBe(false);
		expect([...plan.positions.keys()]).toEqual(['c', 'd']);
		const [first, second] = [plan.positions.get('c') as number, plan.positions.get('d') as number];
		expect(first).toBeGreaterThan(0);
		expect(first).toBeLessThan(second);
		expect(second).toBeLessThan(1);
	});

	it('numbers a run at the tail the way separate adds would', () => {
		const plan = planItemPositions(['a', 'b', 'd', 'c'], contiguous(ids), ['d', 'c']);
		expect(plan.positions.get('d')).toBe(2);
		expect(plan.positions.get('c')).toBe(3);
	});

	it('steps a run at the head below the list', () => {
		const plan = planItemPositions(['c', 'd', 'a', 'b'], contiguous(ids), ['c', 'd']);
		expect(plan.positions.get('d')).toBeLessThan(0);
		expect(plan.positions.get('c')).toBeLessThan(plan.positions.get('d') as number);
	});

	it('never ties two moved rows with each other', () => {
		// A tie is not a scrambled list, it is `created_at` deciding the order
		// instead of the placement. Two rows written in one transaction share it.
		const plan = planItemPositions(['a', 'c', 'd', 'b'], contiguous(ids), ['c', 'd']);
		expect(new Set(plan.positions.values()).size).toBe(plan.positions.size);
	});

	it('rewrites the moved row even when the order does not change', () => {
		// An empty plan is an optimistic transaction that sends no request at all.
		const plan = planItemPositions(ids, contiguous(ids), ['b']);
		expect(plan.positions.size).toBe(1);
		// The midpoint of its own neighbours, which is where it already was.
		expect(plan.positions.get('b')).toBe(1);
	});

	it('plans nothing for an id that is not in the list', () => {
		const plan = planItemPositions(ids, contiguous(ids), ['gone']);
		expect(plan.positions.size).toBe(0);
		expect(plan.normalized).toBe(false);
	});

	it('normalizes the whole list when the gap cannot hold the run', () => {
		const positions: ItemPositions = new Map([
			['a', 0],
			['b', Number.MIN_VALUE],
			['c', 1],
			['d', 2],
		]);
		const plan = planItemPositions(['a', 'c', 'd', 'b'], positions, ['c', 'd']);
		expect(plan.normalized).toBe(true);
		expect([...plan.positions.entries()]).toEqual([
			['a', 0],
			['c', 1],
			['d', 2],
			['b', 3],
		]);
	});

	it('reads back in the order the placement asked for', () => {
		const positions = contiguous(ids);
		const moves: readonly (readonly [readonly string[], string])[] = [
			[['b', 'a', 'c', 'd'], 'b'],
			[['a', 'c', 'b', 'd'], 'c'],
			[['a', 'b', 'd', 'c'], 'd'],
			[['d', 'a', 'b', 'c'], 'd'],
		];
		for (const [order, moved] of moves) {
			const plan = planItemPositions(order, positions, [moved]);
			const merged = new Map([...positions, ...plan.positions]);
			expect(readBack(merged)).toEqual(order);
		}
	});
});

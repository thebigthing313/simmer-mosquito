import { describe, expect, it } from 'vitest';
import {
	type MovePlan,
	planMove,
	planStopPositions,
} from '../../../../components/stop-order/plan-move';

const ids = ['a', 'b', 'c', 'd'];

describe('planMove', () => {
	it('moves an item up, anchoring before its previous neighbour', () => {
		expect(planMove(ids, 2, 'up')).toEqual({
			order: ['a', 'c', 'b', 'd'],
			movedId: 'c',
			placement: { kind: 'before', anchorId: 'b' },
		});
	});

	it('moves an item down, anchoring after its next neighbour', () => {
		expect(planMove(ids, 1, 'down')).toEqual({
			order: ['a', 'c', 'b', 'd'],
			movedId: 'b',
			placement: { kind: 'after', anchorId: 'c' },
		});
	});

	it('moves an item to the start', () => {
		expect(planMove(ids, 2, 'top')).toEqual({
			order: ['c', 'a', 'b', 'd'],
			movedId: 'c',
			placement: { kind: 'start' },
		});
	});

	it('moves an item to the end', () => {
		expect(planMove(ids, 1, 'bottom')).toEqual({
			order: ['a', 'c', 'd', 'b'],
			movedId: 'b',
			placement: { kind: 'end' },
		});
	});

	it('preserves every id when reordering', () => {
		for (const action of ['up', 'down', 'top', 'bottom'] as const) {
			const plan = planMove(ids, 2, action);
			expect(plan === null ? ids : [...plan.order].sort()).toEqual([...ids].sort());
		}
	});

	it.each([
		['up at the start', 0, 'up'],
		['down at the end', 3, 'down'],
		['top when already first', 0, 'top'],
		['bottom when already last', 3, 'bottom'],
	] as const)('returns null for a no-op move: %s', (_label, index, action) => {
		expect(planMove(ids, index, action)).toBeNull();
	});

	it('returns null for an index outside the list', () => {
		expect(planMove(ids, 9, 'up')).toBeNull();
		expect(planMove([], 0, 'top')).toBeNull();
	});

	it('treats a single-item list as unmovable', () => {
		for (const action of ['up', 'down', 'top', 'bottom'] as const) {
			expect(planMove(['only'], 0, action)).toBeNull();
		}
	});
});

describe('planStopPositions', () => {
	const positions = new Map(ids.map((id, index) => [id, index]));
	const positionOf = (id: string) => positions.get(id);

	it('writes only the stop that moved', () => {
		const plan = planMove(ids, 2, 'up') as MovePlan;
		expect([...planStopPositions(plan, positionOf)]).toEqual([['c', 0.5]]);
	});

	it('writes something for every move, so the request is sent', () => {
		// A reorder that wrote no row would complete without calling `mutationFn`.
		for (const [index, action] of [
			[1, 'up'],
			[1, 'down'],
			[2, 'top'],
			[1, 'bottom'],
		] as const) {
			const plan = planMove(ids, index, action) as MovePlan;
			expect(planStopPositions(plan, positionOf).size).toBeGreaterThan(0);
		}
	});

	it('falls back to numbering the list when a stop is not in the collection', () => {
		const plan = planMove(ids, 2, 'up') as MovePlan;
		const written = planStopPositions(plan, (id) => (id === 'b' ? undefined : positions.get(id)));
		expect([...written]).toEqual([
			['a', 0],
			['c', 1],
			['b', 2],
			['d', 3],
		]);
	});
});

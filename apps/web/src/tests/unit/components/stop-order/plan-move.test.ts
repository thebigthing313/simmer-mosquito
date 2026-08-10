import { describe, expect, it } from 'vitest';
import { planMove } from '../../../../components/stop-order/plan-move';

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

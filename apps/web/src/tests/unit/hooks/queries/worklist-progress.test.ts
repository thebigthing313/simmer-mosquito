import { describe, expect, it } from 'vitest';
import { NO_STOPS, worklistProgress } from '../../../../hooks/queries/worklist-progress';

describe('worklistProgress', () => {
	it('treats skipped as handled', () => {
		// A stop the crew passed over is a decision, not outstanding work — which is
		// what lets a worklist with skipped stops be completed at all.
		expect(worklistProgress(4, 2, 1)).toEqual({
			total: 4,
			completed: 2,
			skipped: 1,
			pending: 1,
			handled: 3,
		});
	});

	it('reports nothing outstanding on an empty worklist', () => {
		expect(worklistProgress(0, 0, 0)).toEqual(NO_STOPS);
	});

	it('keeps handled and pending adding up to the total', () => {
		// The three tallies arrive from three separate aggregates. Deriving the other
		// two here is what stops a stop counted twice from reading as more work done
		// than exists.
		for (const [total, completed, skipped] of [
			[8, 3, 2],
			[1, 0, 1],
			[5, 5, 0],
		]) {
			const counts = worklistProgress(total as number, completed as number, skipped as number);
			expect(counts.handled + counts.pending).toBe(counts.total);
		}
	});
});

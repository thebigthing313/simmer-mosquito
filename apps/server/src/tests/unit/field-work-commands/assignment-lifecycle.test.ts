import { CLOCK_SKEW_TOLERANCE_MS } from '@simmer-mosquito/domain';
import { describe, expect, it } from 'vitest';
import {
	type AssignmentSnapshot,
	checkCompleteAssignment,
	checkItemProgress,
	checkReopenAssignment,
	checkStartAssignment,
	readAssignmentItemState,
	readAssignmentState,
} from '../../../field-work-commands/assignment-lifecycle.js';
import { isProgressBeforeStart } from '../../../progress-timing.js';

const at = new Date('2026-08-04T12:00:00.000Z');

describe('readAssignmentState', () => {
	it('derives lifecycle from the timestamp columns', () => {
		expect(readAssignmentState({ started_at: null, completed_at: null, cancelled_at: null })).toBe(
			'not_started',
		);
		expect(readAssignmentState({ started_at: at, completed_at: null, cancelled_at: null })).toBe(
			'in_progress',
		);
		expect(readAssignmentState({ started_at: at, completed_at: at, cancelled_at: null })).toBe(
			'completed',
		);
		expect(readAssignmentState({ started_at: at, completed_at: null, cancelled_at: at })).toBe(
			'cancelled',
		);
	});
});

describe('readAssignmentItemState', () => {
	it('reads progress from the item timestamps', () => {
		expect(readAssignmentItemState({ completed_at: null, skipped_at: null })).toBe('pending');
		expect(readAssignmentItemState({ completed_at: at, skipped_at: null })).toBe('completed');
		expect(readAssignmentItemState({ completed_at: null, skipped_at: at })).toBe('skipped');
	});
});

describe('checkStartAssignment', () => {
	it('allows starting and re-stamping a start time for correction', () => {
		expect(checkStartAssignment(snapshot('not_started'))).toBeNull();
		expect(checkStartAssignment(snapshot('in_progress'))).toBeNull();
	});

	it('refuses to start a terminal assignment', () => {
		expect(checkStartAssignment(snapshot('completed'))).toBe('assignment_not_startable');
		expect(checkStartAssignment(snapshot('cancelled'))).toBe('assignment_not_startable');
	});
});

describe('checkCompleteAssignment', () => {
	it('completes a started assignment whose active items are all handled', () => {
		expect(checkCompleteAssignment(snapshot('in_progress', 3, 0))).toBeNull();
	});

	it('does not auto-start: an unstarted assignment cannot be completed', () => {
		expect(checkCompleteAssignment(snapshot('not_started', 3, 0))).toBe('assignment_not_started');
	});

	it('requires at least one active item', () => {
		expect(checkCompleteAssignment(snapshot('in_progress', 0, 0))).toBe('assignment_has_no_items');
	});

	it('requires every active item to be completed or skipped', () => {
		expect(checkCompleteAssignment(snapshot('in_progress', 3, 1))).toBe('assignment_items_pending');
	});

	it('refuses an already terminal assignment', () => {
		expect(checkCompleteAssignment(snapshot('completed', 3, 0))).toBe('assignment_not_completable');
		expect(checkCompleteAssignment(snapshot('cancelled', 3, 0))).toBe('assignment_not_completable');
	});
});

describe('checkReopenAssignment', () => {
	it('applies only to completed or cancelled assignments', () => {
		expect(checkReopenAssignment(snapshot('completed'))).toBeNull();
		expect(checkReopenAssignment(snapshot('cancelled'))).toBeNull();
		expect(checkReopenAssignment(snapshot('not_started'))).toBe('assignment_not_reopenable');
		expect(checkReopenAssignment(snapshot('in_progress'))).toBe('assignment_not_reopenable');
	});
});

describe('checkItemProgress', () => {
	it('requires a started, non-terminal parent assignment', () => {
		expect(checkItemProgress('complete', 'not_started', 'pending')).toBe('assignment_not_started');
		expect(checkItemProgress('complete', 'completed', 'pending')).toBe(
			'assignment_not_in_progress',
		);
		expect(checkItemProgress('complete', 'cancelled', 'pending')).toBe(
			'assignment_not_in_progress',
		);
	});

	it('sends a skipped stop through unskip rather than clearing the skip silently', () => {
		expect(checkItemProgress('complete', 'in_progress', 'skipped')).toBe('assignment_item_skipped');
		expect(checkItemProgress('complete', 'in_progress', 'pending')).toBeNull();
	});

	it('reopens only completed items and unskips only skipped ones', () => {
		expect(checkItemProgress('reopen', 'in_progress', 'completed')).toBeNull();
		expect(checkItemProgress('reopen', 'in_progress', 'pending')).toBe(
			'assignment_item_not_completed',
		);
		expect(checkItemProgress('unskip', 'in_progress', 'skipped')).toBeNull();
		expect(checkItemProgress('unskip', 'in_progress', 'completed')).toBe(
			'assignment_item_not_skipped',
		);
	});

	it('allows skipping a stop in any non-skipped state', () => {
		expect(checkItemProgress('skip', 'in_progress', 'pending')).toBeNull();
		expect(checkItemProgress('skip', 'in_progress', 'completed')).toBeNull();
	});

	it('refuses progress dated before the assignment started', () => {
		expect(
			checkItemProgress('complete', 'in_progress', 'pending', {
				progressAt: new Date('2026-08-04T07:00:00.000Z'),
				startedAt: new Date('2026-08-04T09:00:00.000Z'),
			}),
		).toBe('assignment_item_progress_before_start');
	});

	it('reports the state problem first when a stop has both', () => {
		// A skipped stop being completed with an impossible timestamp is told to
		// unskip first. Answering with the timing rule would send someone to check
		// the clock over a transition that was never going to be allowed.
		expect(
			checkItemProgress('complete', 'in_progress', 'skipped', {
				progressAt: new Date('2026-08-04T07:00:00.000Z'),
				startedAt: new Date('2026-08-04T09:00:00.000Z'),
			}),
		).toBe('assignment_item_skipped');
	});
});

describe('isProgressBeforeStart', () => {
	const startedAt = new Date('2026-08-04T09:00:00.000Z');

	it('accepts a stop finished after the assignment began', () => {
		expect(isProgressBeforeStart(new Date('2026-08-04T09:30:00.000Z'), startedAt)).toBe(false);
	});

	it('accepts a stop finished at the exact start instant', () => {
		// "On or after", so the boundary itself is allowed.
		expect(isProgressBeforeStart(startedAt, startedAt)).toBe(false);
	});

	it('forgives a device clock inside the same allowance the future check uses', () => {
		// The failure this prevents: `started_at` is the server's `now()`, the
		// progress time is the phone's, and a phone a minute slow would otherwise
		// have real work refused for happening "before" an assignment it was part
		// of. This is #37's fix from the other direction.
		const slightlySlow = new Date(startedAt.getTime() - CLOCK_SKEW_TOLERANCE_MS + 1_000);

		expect(isProgressBeforeStart(slightlySlow, startedAt)).toBe(false);
	});

	it('refuses a timestamp further back than ordinary drift explains', () => {
		const wellBefore = new Date(startedAt.getTime() - CLOCK_SKEW_TOLERANCE_MS - 60_000);

		expect(isProgressBeforeStart(wellBefore, startedAt)).toBe(true);
	});

	it('has nothing to say when either clock is unknown', () => {
		// A null progress time means the server is about to stamp it; a null
		// `started_at` is already refused as `assignment_not_started`.
		expect(isProgressBeforeStart(null, startedAt)).toBe(false);
		expect(isProgressBeforeStart(new Date('2020-01-01T00:00:00.000Z'), null)).toBe(false);
		expect(isProgressBeforeStart(null, null)).toBe(false);
	});
});

function snapshot(
	state: AssignmentSnapshot['state'],
	activeItemCount = 1,
	pendingItemCount = 0,
): AssignmentSnapshot {
	return { state, activeItemCount, pendingItemCount };
}

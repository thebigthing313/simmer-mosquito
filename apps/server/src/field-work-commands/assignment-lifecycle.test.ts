import { describe, expect, it } from 'vitest';
import {
	type AssignmentSnapshot,
	checkCompleteAssignment,
	checkItemProgress,
	checkReopenAssignment,
	checkStartAssignment,
	readAssignmentItemState,
	readAssignmentState,
} from './assignment-lifecycle.js';

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
});

function snapshot(
	state: AssignmentSnapshot['state'],
	activeItemCount = 1,
	pendingItemCount = 0,
): AssignmentSnapshot {
	return { state, activeItemCount, pendingItemCount };
}

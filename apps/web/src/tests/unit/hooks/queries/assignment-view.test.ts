import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	assignmentDisplayName,
	assignmentOwnName,
	assignmentStatus,
	formatAssignmentDate,
} from '../../../../hooks/queries/assignment-view';

const lifecycle = (
	startedAt: Date | string | null,
	completedAt: Date | string | null,
	cancelledAt: Date | string | null,
) => ({ startedAt, completedAt, cancelledAt });

describe('assignmentStatus', () => {
	it('derives the four states from timestamps', () => {
		expect(assignmentStatus(lifecycle(null, null, null))).toBe('notStarted');
		expect(assignmentStatus(lifecycle('t', null, null))).toBe('inProgress');
		expect(assignmentStatus(lifecycle('t', 't', null))).toBe('completed');
		expect(assignmentStatus(lifecycle('t', null, 't'))).toBe('cancelled');
	});

	it('resolves a completed-and-cancelled row the way the server would', () => {
		// readLifecycleTransition checks completedAt before cancelledAt. If this ever
		// disagreed, a row would render as one state and PATCH as the other.
		expect(assignmentStatus(lifecycle('t', 't', 't'))).toBe('completed');
	});

	it('reports completed even when the row was never started', () => {
		expect(assignmentStatus(lifecycle(null, 't', null))).toBe('completed');
	});

	it('reads a parsed timestamp the same as an unparsed one', () => {
		// The schedule reads through a collection whose row schema turns a
		// `timestamptz` into a `Date`; the run pages still read the raw string. Both
		// have to derive the same state, or a worklist reads as running on one
		// surface and finished on the other.
		const instant = new Date('2026-08-04T15:00:00Z');
		expect(assignmentStatus(lifecycle(instant, null, null))).toBe('inProgress');
		expect(assignmentStatus(lifecycle(instant, instant, null))).toBe('completed');
	});
});

describe('assignmentDisplayName', () => {
	it('draws an explicit name, trimmed', () => {
		expect(
			assignmentDisplayName({ assignmentName: '  North sweep ', assignmentDate: '2026-08-04' }),
		).toBe('North sweep');
	});

	it('names an unnamed assignment by its formatted date', () => {
		expect(assignmentDisplayName({ assignmentName: null, assignmentDate: '2026-08-04' })).toBe(
			'Tue, Aug 4, 2026',
		);
	});

	it('reads a name that is only whitespace as no name', () => {
		expect(assignmentDisplayName({ assignmentName: '   ', assignmentDate: '2026-08-04' })).toBe(
			'Tue, Aug 4, 2026',
		);
	});
});

describe('assignmentOwnName', () => {
	it('is the trimmed name, or null when nothing is left', () => {
		expect(assignmentOwnName({ assignmentName: '  North sweep ' })).toBe('North sweep');
		expect(assignmentOwnName({ assignmentName: '   ' })).toBeNull();
		expect(assignmentOwnName({ assignmentName: null })).toBeNull();
	});
});

/**
 * The eleventh copy of the calendar-date parse #609 collapsed, and the one its
 * search missed: it was spelled `split('-')` with no leading slice rather than
 * `slice(0, 10).split('-')`.
 *
 * The missing slice is why the guard never fired on a timestamp. `Number` turned
 * `04T00:00:00Z` into `NaN` rather than `undefined`, so the check passed and the
 * page drew `Invalid Date`.
 */
describe('formatAssignmentDate', () => {
	let warn: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		warn.mockRestore();
	});

	// The wording as well as the day: the formatter pins `en-US` since #683, and
	// the weekday is part of what a worklist row reads.
	it("renders the assignment's day, whatever zone the reader is in", () => {
		expect(formatAssignmentDate('2026-08-04')).toBe('Tue, Aug 4, 2026');
	});

	it('reads the day a timestamp begins on rather than drawing Invalid Date', () => {
		expect(formatAssignmentDate('2026-08-04T00:00:00Z')).toBe(formatAssignmentDate('2026-08-04'));
	});

	it('hands back a date it cannot read, and says so', () => {
		expect(formatAssignmentDate('4 August')).toBe('4 August');
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('formatAssignmentDate');
	});
});

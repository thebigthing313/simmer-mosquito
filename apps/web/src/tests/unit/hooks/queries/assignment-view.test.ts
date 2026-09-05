import { describe, expect, it } from 'vitest';
import {
	assignmentDisplayName,
	assignmentStatus,
	formatDueAt,
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
	it('prefers an explicit name', () => {
		expect(
			assignmentDisplayName(
				{ assignmentName: 'North sweep', assignmentDate: '2026-08-04' },
				'Rivera',
			),
		).toBe('North sweep');
	});

	it('falls back to the date and assignee', () => {
		expect(
			assignmentDisplayName({ assignmentName: null, assignmentDate: '2026-08-04' }, 'Rivera'),
		).toBe('2026-08-04 — Rivera');
	});

	it('falls back to the date alone when nobody is assigned', () => {
		expect(
			assignmentDisplayName({ assignmentName: null, assignmentDate: '2026-08-04' }, null),
		).toBe('2026-08-04');
	});

	it('ignores a name that is only whitespace', () => {
		expect(
			assignmentDisplayName({ assignmentName: '   ', assignmentDate: '2026-08-04' }, null),
		).toBe('2026-08-04');
	});
});

describe('formatDueAt', () => {
	const instant = new Date('2026-08-04T20:30:00Z');

	it('reads a due time on the organization clock, not the browser one', () => {
		// 20:30 UTC is 4:30pm in New York and 1:30pm in Los Angeles. Two zones far
		// enough apart that a helper ignoring the argument would agree with itself.
		expect(formatDueAt(instant, 'America/New_York')).toContain('4:30');
		expect(formatDueAt(instant, 'America/Los_Angeles')).toContain('1:30');
	});

	it('reads a parsed instant the same as the string it came from', () => {
		expect(formatDueAt(instant, 'America/New_York')).toBe(
			formatDueAt(instant.toISOString(), 'America/New_York'),
		);
	});

	it('shows nothing rather than an invalid date', () => {
		expect(formatDueAt(null, 'America/New_York')).toBeNull();
		expect(formatDueAt('not a time', 'America/New_York')).toBeNull();
	});
});

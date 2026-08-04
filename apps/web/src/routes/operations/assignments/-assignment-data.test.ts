import { describe, expect, it } from 'vitest';
import {
	assignmentDisplayName,
	assignmentStatus,
	assignmentStopTone,
	canCompleteAssignment,
	canStartAssignment,
	itemProgress,
	progressCounts,
	targetTypeOf,
} from './-assignment-data';

const lifecycle = (
	startedAt: string | null,
	completedAt: string | null,
	cancelledAt: string | null,
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
});

describe('itemProgress', () => {
	it('derives progress from timestamps', () => {
		expect(itemProgress({ completedAt: null, skippedAt: null })).toBe('pending');
		expect(itemProgress({ completedAt: 't', skippedAt: null })).toBe('completed');
		expect(itemProgress({ completedAt: null, skippedAt: 't' })).toBe('skipped');
	});

	it('treats skipped as winning, matching readItemLifecycleTransition', () => {
		expect(itemProgress({ completedAt: 't', skippedAt: 't' })).toBe('skipped');
	});
});

describe('targetTypeOf', () => {
	it('passes through the single-word types unchanged', () => {
		expect(targetTypeOf('trap')).toBe('trap');
		expect(targetTypeOf('habitat')).toBe('habitat');
	});

	it('accepts both spellings of the multi-word type', () => {
		// The optimistic row carries the command wire's camelCase; the row that syncs
		// back carries what the column stores. Both have to resolve to one type.
		expect(targetTypeOf('serviceRequest')).toBe('serviceRequest');
		expect(targetTypeOf('service_request')).toBe('serviceRequest');
	});

	it('returns null for a discriminator it does not know', () => {
		expect(targetTypeOf('inspection')).toBeNull();
		expect(targetTypeOf('')).toBeNull();
	});
});

describe('progressCounts', () => {
	it('tallies each state and treats skipped as handled', () => {
		expect(
			progressCounts([
				{ progress: 'completed' },
				{ progress: 'skipped' },
				{ progress: 'pending' },
				{ progress: 'completed' },
			]),
		).toEqual({ total: 4, completed: 2, skipped: 1, pending: 1, handled: 3 });
	});

	it('counts an empty worklist as nothing outstanding', () => {
		expect(progressCounts([])).toEqual({
			total: 0,
			completed: 0,
			skipped: 0,
			pending: 0,
			handled: 0,
		});
	});
});

describe('canStartAssignment', () => {
	it('needs an unstarted assignment with at least one stop', () => {
		const withStops = progressCounts([{ progress: 'pending' }]);
		expect(canStartAssignment('notStarted', withStops)).toBe(true);
		expect(canStartAssignment('notStarted', progressCounts([]))).toBe(false);
		expect(canStartAssignment('inProgress', withStops)).toBe(false);
		expect(canStartAssignment('completed', withStops)).toBe(false);
	});
});

describe('canCompleteAssignment', () => {
	const handled = progressCounts([{ progress: 'completed' }, { progress: 'skipped' }]);

	it('allows completion once every stop is handled', () => {
		expect(canCompleteAssignment('inProgress', handled)).toBe(true);
	});

	it('blocks completion while any stop is pending', () => {
		expect(canCompleteAssignment('inProgress', progressCounts([{ progress: 'pending' }]))).toBe(
			false,
		);
	});

	it('blocks completion of an empty or unstarted assignment', () => {
		expect(canCompleteAssignment('inProgress', progressCounts([]))).toBe(false);
		expect(canCompleteAssignment('notStarted', handled)).toBe(false);
		expect(canCompleteAssignment('completed', handled)).toBe(false);
	});
});

describe('assignmentStopTone', () => {
	const stop = (progress: 'pending' | 'completed' | 'skipped') =>
		({ progress }) as Parameters<typeof assignmentStopTone>[0];

	it('maps progress onto the map layer tones', () => {
		expect(assignmentStopTone(stop('pending'))).toBe('default');
		expect(assignmentStopTone(stop('completed'))).toBe('inactive');
		expect(assignmentStopTone(stop('skipped'))).toBe('inaccessible');
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

import { describe, expect, it } from 'vitest';
import {
	controlTypeLabel,
	formatRequestedAt,
	formatScheduledStart,
	missionDisplayName,
	missionStatus,
	requestStatus,
} from '../../../../hooks/queries/operations-view';

const lifecycle = (
	startedAt: Date | string | null,
	completedAt: Date | string | null,
	cancelledAt: Date | string | null,
) => ({ startedAt, completedAt, cancelledAt });

describe('missionStatus', () => {
	it('derives the four states from timestamps', () => {
		expect(missionStatus(lifecycle(null, null, null))).toBe('scheduled');
		expect(missionStatus(lifecycle('t', null, null))).toBe('inProgress');
		expect(missionStatus(lifecycle('t', 't', null))).toBe('completed');
		expect(missionStatus(lifecycle('t', null, 't'))).toBe('cancelled');
	});

	it('resolves a completed-and-cancelled row the way the server would', () => {
		// deriveMissionLifecycleStatus checks completedAt before cancelledAt. If this
		// disagreed, a mission would render as one state and PATCH as the other.
		expect(missionStatus(lifecycle('t', 't', 't'))).toBe('completed');
	});

	it('reports completed even when the row was never started', () => {
		// The server auto-starts a mission completed straight from scheduled, so a
		// row with a completion and no start is a real row, not a corrupt one.
		expect(missionStatus(lifecycle(null, 't', null))).toBe('completed');
	});

	it('reads a parsed timestamp the same as an unparsed one', () => {
		// The schedule reads through a collection whose row schema turns a
		// `timestamptz` into a `Date`; the detail page still reads the raw string.
		const instant = new Date('2026-08-04T15:00:00Z');
		expect(missionStatus(lifecycle(instant, null, null))).toBe('inProgress');
		expect(missionStatus(lifecycle(instant, instant, null))).toBe('completed');
	});
});

describe('requestStatus', () => {
	it('is open until something resolves it', () => {
		expect(requestStatus({ resolvedAt: null })).toBe('open');
		expect(requestStatus({ resolvedAt: 't' })).toBe('resolved');
		expect(requestStatus({ resolvedAt: new Date('2026-08-04T15:00:00Z') })).toBe('resolved');
	});
});

describe('missionDisplayName', () => {
	const scheduledStartAt = new Date('2026-08-04T15:00:00Z');

	it('prefers an explicit name', () => {
		expect(
			missionDisplayName(
				{ missionName: 'Levee run', controlType: 'application', scheduledStartAt },
				'America/New_York',
			),
		).toBe('Levee run');
	});

	it('ignores a name that is only whitespace', () => {
		const name = missionDisplayName(
			{ missionName: '  ', controlType: 'application', scheduledStartAt },
			'America/New_York',
		);
		expect(name).toContain('Application');
	});

	it('names an unnamed mission by what it is and when it runs', () => {
		const name = missionDisplayName(
			{ missionName: null, controlType: 'source_reduction', scheduledStartAt },
			'America/New_York',
		);
		expect(name).toContain('Source Reduction');
		// 15:00 UTC is 11am in New York. The fallback carries the agency's zone, so
		// two dispatchers in different zones name the same mission the same way.
		expect(name).toContain('11:00');
	});
});

describe('formatScheduledStart', () => {
	const instant = new Date('2026-08-04T15:00:00Z');

	it('reads the start on the organization clock, not the browser one', () => {
		// Two zones far enough apart that a helper ignoring the argument would agree
		// with itself: 15:00 UTC is 11am in New York and 8am in Los Angeles.
		expect(formatScheduledStart(instant, 'America/New_York')).toContain('11:00');
		expect(formatScheduledStart(instant, 'America/Los_Angeles')).toContain('8:00');
	});

	it('reads a parsed instant the same as the string it came from', () => {
		expect(formatScheduledStart(instant, 'America/New_York')).toBe(
			formatScheduledStart(instant.toISOString(), 'America/New_York'),
		);
	});

	it('prints what it was given rather than "Invalid Date"', () => {
		expect(formatScheduledStart('not a time', 'America/New_York')).toBe('not a time');
	});
});

describe('formatRequestedAt', () => {
	it('reads the day a request came in on the organization calendar', () => {
		// 02:00 UTC on the 5th is still the evening of the 4th in New York. Dating
		// this in the browser's zone puts a request on a day nobody worked.
		const instant = new Date('2026-08-05T02:00:00Z');
		expect(formatRequestedAt(instant, 'America/New_York')).toContain('4');
		expect(formatRequestedAt(instant, 'UTC')).toContain('5');
	});
});

describe('controlTypeLabel', () => {
	it('reads the four stored enum values', () => {
		expect(controlTypeLabel('application')).toBe('Application');
		expect(controlTypeLabel('source_reduction')).toBe('Source Reduction');
		expect(controlTypeLabel('biocontrol')).toBe('Biocontrol');
		expect(controlTypeLabel('outreach')).toBe('Outreach');
	});

	it('passes an unknown value through rather than rendering "undefined"', () => {
		expect(controlTypeLabel('trapping')).toBe('trapping');
	});
});

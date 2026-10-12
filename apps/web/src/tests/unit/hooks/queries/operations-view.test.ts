import { describe, expect, it } from 'vitest';
import {
	controlTypeLabel,
	isMissionPastDue,
	missionDisplayName,
	missionDueCutoff,
	missionStatus,
	requestStatus,
} from '../../../../hooks/queries/operations-view';
import { createOrganizationClock } from '../../../../lib/organization-clock';

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

describe('isMissionPastDue', () => {
	// 13:00 UTC on Oct 12 is 9am in New York.
	const clock = createOrganizationClock('America/New_York', () => new Date('2026-10-12T13:00:00Z'));
	const unstarted = (scheduledStartAt: Date | string) => ({
		scheduledStartAt,
		...lifecycle(null, null, null),
	});

	it('reads a scheduled mission one day past its start as past due', () => {
		// 7:30pm in New York on Oct 11.
		expect(isMissionPastDue(unstarted(new Date('2026-10-11T23:30:00Z')), clock)).toBe(true);
	});

	it('counts days in the Organization zone, not UTC', () => {
		// 01:00 UTC on Oct 12 is 9pm on Oct 11 in New York: yesterday there.
		expect(isMissionPastDue(unstarted('2026-10-12T01:00:00Z'), clock)).toBe(true);
		// 04:30 UTC on Oct 12 is 12:30am on Oct 12 in New York: due today, not past it.
		expect(isMissionPastDue(unstarted('2026-10-12T04:30:00Z'), clock)).toBe(false);
	});

	it('leaves a mission due today or later as scheduled', () => {
		expect(isMissionPastDue(unstarted(new Date('2026-10-12T11:00:00Z')), clock)).toBe(false);
		expect(isMissionPastDue(unstarted(new Date('2026-10-13T23:30:00Z')), clock)).toBe(false);
	});

	it('is never past due once started or ended', () => {
		const start = new Date('2026-10-08T23:30:00Z');
		expect(
			isMissionPastDue({ scheduledStartAt: start, ...lifecycle('t', null, null) }, clock),
		).toBe(false);
		expect(
			isMissionPastDue({ scheduledStartAt: start, ...lifecycle(null, 't', null) }, clock),
		).toBe(false);
		expect(
			isMissionPastDue({ scheduledStartAt: start, ...lifecycle(null, null, 't') }, clock),
		).toBe(false);
	});

	it('draws the line the Dashboard queue draws for the day before', () => {
		// Past due is the queue's rule moved back a day: a start before the cut-off
		// for yesterday. The queue's own cut-off is the same function for today.
		expect(missionDueCutoff('2026-10-11', clock.zone).toISOString()).toBe(
			'2026-10-12T04:00:00.000Z',
		);
		expect(isMissionPastDue(unstarted('2026-10-12T03:59:59Z'), clock)).toBe(true);
		expect(isMissionPastDue(unstarted('2026-10-12T04:00:00Z'), clock)).toBe(false);
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
	const clock = createOrganizationClock('America/New_York');
	const scheduledStartAt = new Date('2026-08-04T15:00:00Z');

	it('prefers an explicit name', () => {
		expect(
			missionDisplayName(
				{ missionName: 'Levee run', controlType: 'application', scheduledStartAt },
				clock,
			),
		).toBe('Levee run');
	});

	it('ignores a name that is only whitespace', () => {
		const name = missionDisplayName(
			{ missionName: '  ', controlType: 'application', scheduledStartAt },
			clock,
		);
		expect(name).toContain('Application');
	});

	it('names an unnamed mission by what it is and when it runs', () => {
		const name = missionDisplayName(
			{ missionName: null, controlType: 'source_reduction', scheduledStartAt },
			clock,
		);
		expect(name).toContain('Source Reduction on ');
		// 15:00 UTC is 11am in New York. The fallback carries the organization's
		// zone, so two dispatchers in different zones name the same mission the
		// same way.
		expect(name).toContain('11:00');
	});

	it('names an unnamed mission by what it is when the schedule will not parse', () => {
		// `formatInstant` echoes an unparseable Date as `Invalid Date`, and a
		// mission named `Application on Invalid Date` is a name nobody gave it.
		const name = missionDisplayName(
			{ missionName: null, controlType: 'application', scheduledStartAt: new Date('nonsense') },
			clock,
		);
		expect(name).toBe('Application');
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

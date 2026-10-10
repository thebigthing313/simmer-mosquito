import { describe, expect, it } from 'vitest';
import {
	controlTypeLabel,
	missionDisplayName,
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

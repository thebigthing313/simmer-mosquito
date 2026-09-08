import { describe, expect, it } from 'vitest';
import {
	type MissionFormValues,
	missionFormValuesFrom,
	readMissionPlan,
} from '../../../../../routes/operations/missions/-mission-form';

/**
 * A mission's schedule, out of the form and back into it.
 *
 * `scheduledStartAt` is one instant; the form is a day and two times. Both
 * halves used the *browser's* clock while the mission list and detail page
 * showed the organization's (`formatScheduledStart`), so a 06:00 muster read as
 * 06:00 to the dispatcher editing it and as something else to everyone else.
 */
describe('a mission schedule, out of the form and back', () => {
	const ORGANIZATION_ZONE = 'America/New_York';

	function values(overrides: Partial<MissionFormValues> = {}): MissionFormValues {
		return {
			controlType: 'application',
			startDate: '2026-08-04',
			startTime: '06:00',
			endTime: '10:30',
			rainDate: '',
			missionName: '',
			plannedMethodId: 'no-method',
			assignedToProfileId: 'no-assignee',
			notificationTypeId: 'no-notification-type',
			...overrides,
		};
	}

	// Two zones, sixteen hours apart, because a browser-zone implementation
	// answers both the same and would pass wherever the suite happens to run.
	it('schedules the instant the organization means, not the one the browser does', () => {
		// 06:00 on 4 August is 10:00Z in New York (UTC-4) and 18:00Z the previous
		// day in Auckland (UTC+12).
		expect(readMissionPlan(values(), ORGANIZATION_ZONE).startAt?.toISOString()).toBe(
			'2026-08-04T10:00:00.000Z',
		);
		expect(readMissionPlan(values(), 'Pacific/Auckland').startAt?.toISOString()).toBe(
			'2026-08-03T18:00:00.000Z',
		);
	});

	it('reopens on the day and times it was scheduled with', () => {
		for (const zone of ['America/New_York', 'Pacific/Auckland']) {
			const plan = readMissionPlan(values(), zone);
			const reopened = missionFormValuesFrom(
				{
					controlType: plan.controlType,
					// Instants, as the query seam hands them over: a `timestamptz` read
					// through a collection with a row schema arrives parsed.
					scheduledStartAt: plan.startAt as Date,
					scheduledEndAt: plan.endAt,
					rainDate: null,
					missionName: null,
					plannedMethodId: null,
					assignedToProfileId: null,
					notificationTypeId: null,
				},
				zone,
			);
			expect(reopened.startDate).toBe('2026-08-04');
			expect(reopened.startTime).toBe('06:00');
			expect(reopened.endTime).toBe('10:30');
		}
	});

	it('leaves an open-ended mission open-ended', () => {
		expect(readMissionPlan(values({ endTime: '' }), ORGANIZATION_ZONE).endAt).toBeNull();
	});
});

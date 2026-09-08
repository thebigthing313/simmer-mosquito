import { describe, expect, it } from 'vitest';
import {
	type AssignmentDetailValues,
	toAssignmentDetails,
	toDueAt,
} from '../../../../../routes/operations/assignments/-assignment-form';

/**
 * A due time is typed as a wall clock and stored as an instant, and the two are
 * only the same fact once a zone says which. The form wrote and re-read that
 * pair in the *browser's* zone while `formatDueAt` shows it in the
 * *organization's*, so a dispatcher working from another zone set one time and
 * the crew read another.
 */
describe('an assignment due time, saved and reopened', () => {
	const ORGANIZATION_ZONE = 'America/New_York';

	function details(overrides: Partial<AssignmentDetailValues> = {}): AssignmentDetailValues {
		return {
			assignmentName: '',
			assignmentDate: '2026-08-04',
			assignedToProfileId: 'no-assignee',
			dueTime: '16:00',
			...overrides,
		};
	}

	// Two organization zones rather than one, because a browser-zone
	// implementation answers both the same and so passes whenever the machine
	// running the suite happens to sit in the zone under test. Sixteen hours
	// apart, nothing to coincide with.
	it('stores the wall time the organization reads, whoever typed it', () => {
		// 16:00 on 4 August is 20:00Z in New York (UTC-4) and 04:00Z in Auckland
		// (UTC+12) — a fact about the organization, not about the machine the form
		// was filled in on.
		expect(toDueAt(details(), ORGANIZATION_ZONE)).toEqual(new Date('2026-08-04T20:00:00.000Z'));
		expect(toDueAt(details(), 'Pacific/Auckland')).toEqual(new Date('2026-08-04T04:00:00.000Z'));
	});

	it('reopens on the same time it was saved with', () => {
		for (const zone of [ORGANIZATION_ZONE, 'Pacific/Auckland']) {
			const reopened = toAssignmentDetails(
				{
					assignmentName: null,
					assignmentDate: '2026-08-04',
					assignedToProfileId: null,
					dueAt: toDueAt(details(), zone),
				},
				zone,
			);
			expect(reopened.dueTime).toBe('16:00');
		}
	});

	it('has no instant to store without a time', () => {
		expect(toDueAt(details({ dueTime: '' }), ORGANIZATION_ZONE)).toBeNull();
		expect(toDueAt(details({ assignmentDate: '' }), ORGANIZATION_ZONE)).toBeNull();
	});
});

import { describe, expect, it } from 'vitest';
import {
	type AssignmentDetailValues,
	deadlineHalfEntered,
	sameAssignmentDetails,
	toAssignmentDetails,
	toDueAt,
	withDueTime,
} from '../../../../../routes/operations/assignments/-assignment-form';

/**
 * A deadline is typed as a day and a wall time and stored as an instant, and
 * the two are only the same fact once a zone says which. The form wrote and
 * re-read that pair in the *browser's* zone while `formatDueAt` shows it in
 * the *organization's*, so a dispatcher working from another zone set one time
 * and the crew read another. Then it read only the time back, so a deadline on
 * any day but the assignment date came back on the assignment date and the
 * next save moved it there (#1005).
 */
describe('an assignment deadline, saved and reopened', () => {
	const ORGANIZATION_ZONE = 'America/New_York';

	// Two organization zones rather than one, because a browser-zone
	// implementation answers both the same and so passes whenever the machine
	// running the suite happens to sit in the zone under test. Sixteen hours
	// apart, nothing to coincide with.
	const ZONES = [ORGANIZATION_ZONE, 'Pacific/Auckland'] as const;

	function details(overrides: Partial<AssignmentDetailValues> = {}): AssignmentDetailValues {
		return {
			assignmentName: '',
			assignmentDate: '2026-08-04',
			assignedToProfileId: 'no-assignee',
			dueDate: '2026-08-04',
			dueTime: '16:00',
			...overrides,
		};
	}

	function stored(dueAt: Date | null) {
		return {
			assignmentName: null,
			assignmentDate: '2026-08-04',
			assignedToProfileId: null,
			dueAt,
		};
	}

	it('stores the wall time the organization reads, whoever typed it', () => {
		// 16:00 on 4 August is 20:00Z in New York (UTC-4) and 04:00Z in Auckland
		// (UTC+12), a fact about the organization and not about the machine the
		// form was filled in on.
		expect(toDueAt(details(), ORGANIZATION_ZONE)).toEqual(new Date('2026-08-04T20:00:00.000Z'));
		expect(toDueAt(details(), 'Pacific/Auckland')).toEqual(new Date('2026-08-04T04:00:00.000Z'));
	});

	it('stores a deadline on another day as that day', () => {
		// Dated Tuesday the 4th, due Thursday the 6th. The assignment date plays
		// no part in the instant.
		const later = details({ dueDate: '2026-08-06' });
		expect(toDueAt(later, ORGANIZATION_ZONE)).toEqual(new Date('2026-08-06T20:00:00.000Z'));
		expect(toDueAt(later, 'Pacific/Auckland')).toEqual(new Date('2026-08-06T04:00:00.000Z'));
	});

	it('reopens a deadline on another day on that day, and on the organization clock', () => {
		for (const zone of ZONES) {
			const reopened = toAssignmentDetails(
				stored(toDueAt(details({ dueDate: '2026-08-06' }), zone)),
				zone,
			);
			expect(reopened.dueDate).toBe('2026-08-06');
			expect(reopened.dueTime).toBe('16:00');
		}
	});

	it('reads the day on the organization clock and not the UTC one', () => {
		// 23:00 in New York on the 6th is 03:00Z on the 7th. The form shows the
		// 6th, which is the day the crew is working against.
		const evening = toAssignmentDetails(
			stored(new Date('2026-08-07T03:00:00.000Z')),
			ORGANIZATION_ZONE,
		);
		expect(evening).toMatchObject({ dueDate: '2026-08-06', dueTime: '23:00' });
		// The same instant is 15:00 on the 7th in Auckland, and reads so there.
		const auckland = toAssignmentDetails(
			stored(new Date('2026-08-07T03:00:00.000Z')),
			'Pacific/Auckland',
		);
		expect(auckland).toMatchObject({ dueDate: '2026-08-07', dueTime: '15:00' });
	});

	it('leaves the instant where it was when reopened and saved with no edits', () => {
		// The whole bug, asserted on the instant rather than on the rendered pair:
		// hydrate then save must be the identity on `due_at`, in either zone.
		for (const zone of ZONES) {
			for (const instant of [
				new Date('2026-08-06T20:00:00.000Z'),
				new Date('2026-08-07T03:00:00.000Z'),
				new Date('2026-08-04T20:00:00.000Z'),
			]) {
				const reopened = toAssignmentDetails(stored(instant), zone);
				expect(toDueAt(reopened, zone)).toEqual(instant);
				expect(sameAssignmentDetails(reopened, toAssignmentDetails(stored(instant), zone))).toBe(
					true,
				);
			}
		}
	});

	it('has no instant to store without a deadline', () => {
		expect(toDueAt(details({ dueDate: '', dueTime: '' }), ORGANIZATION_ZONE)).toBeNull();
		for (const zone of ZONES) {
			const reopened = toAssignmentDetails(stored(null), zone);
			expect(reopened).toMatchObject({ dueDate: '', dueTime: '' });
			expect(toDueAt(reopened, zone)).toBeNull();
		}
	});

	it('refuses a half-entered deadline rather than putting it on an unstated day', () => {
		const timeOnly = details({ dueDate: '' });
		const dateOnly = details({ dueTime: '' });
		expect(deadlineHalfEntered(timeOnly)).toBe(true);
		expect(deadlineHalfEntered(dateOnly)).toBe(true);
		expect(deadlineHalfEntered(details())).toBe(false);
		expect(deadlineHalfEntered(details({ dueDate: '', dueTime: '' }))).toBe(false);
		expect(toDueAt(timeOnly, ORGANIZATION_ZONE)).toBeNull();
		expect(toDueAt(dateOnly, ORGANIZATION_ZONE)).toBeNull();
	});

	it('reads a deadline on another day as a change from one on the assignment date', () => {
		expect(sameAssignmentDetails(details(), details({ dueDate: '2026-08-06' }))).toBe(false);
	});
});

describe('typing a due time', () => {
	function blank(): AssignmentDetailValues {
		return {
			assignmentName: '',
			assignmentDate: '2026-08-04',
			assignedToProfileId: 'no-assignee',
			dueDate: '',
			dueTime: '',
		};
	}

	it('dates the deadline on the assignment date when no date has been picked', () => {
		expect(withDueTime(blank(), '16:00')).toMatchObject({
			dueDate: '2026-08-04',
			dueTime: '16:00',
		});
	});

	it('keeps a due date the operator already picked', () => {
		const picked = { ...blank(), dueDate: '2026-08-06' };
		expect(withDueTime(picked, '16:00')).toMatchObject({
			dueDate: '2026-08-06',
			dueTime: '16:00',
		});
	});

	it('keeps the due date when the time is cleared', () => {
		const entered = withDueTime(blank(), '16:00');
		expect(withDueTime(entered, '')).toMatchObject({ dueDate: '2026-08-04', dueTime: '' });
	});

	it('does not follow a later change to the assignment date', () => {
		// The due date is its own field once entered. Moving the assignment date
		// is a change to when the work is scheduled, not to when it is due.
		const entered = withDueTime(blank(), '16:00');
		const rescheduled = { ...entered, assignmentDate: '2026-08-05' };
		expect(rescheduled.dueDate).toBe('2026-08-04');
		expect(withDueTime(rescheduled, '17:00').dueDate).toBe('2026-08-04');
	});
});

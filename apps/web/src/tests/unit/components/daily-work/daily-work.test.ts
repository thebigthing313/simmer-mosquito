import { describe, expect, it } from 'vitest';
import { activityPanelState } from '../../../../components/activity/activity-data';
import {
	DAILY_WORK_COPY,
	dailyWorkDay,
	dailyWorkStep,
	isProfileId,
} from '../../../../components/daily-work/daily-work';

// Daily Work's pure half: which day the page is on, and whether the path names
// a Profile at all. Each has a wrong answer that shows nothing and says nothing
// about why.

describe('dailyWorkDay', () => {
	it('falls back to the organization’s today when the URL carries no day', () => {
		expect(dailyWorkDay('', '2026-09-04')).toBe('2026-09-04');
	});

	it('keeps a past day the reader asked for', () => {
		expect(dailyWorkDay('2026-08-12', '2026-09-04')).toBe('2026-08-12');
	});

	// A future day holds no field work, so it would draw an empty page that reads
	// as a quiet day. The picker cannot select one; a stale or hand-edited URL can.
	it('pulls a future day back to today', () => {
		expect(dailyWorkDay('2027-01-01', '2026-09-04')).toBe('2026-09-04');
	});

	it('treats today itself as selectable', () => {
		expect(dailyWorkDay('2026-09-04', '2026-09-04')).toBe('2026-09-04');
	});
});

describe('dailyWorkStep', () => {
	it('walks back a day', () => {
		expect(dailyWorkStep('2026-09-04', -1, '2026-09-10')).toBe('2026-09-03');
	});

	it('walks forward a day', () => {
		expect(dailyWorkStep('2026-09-04', 1, '2026-09-10')).toBe('2026-09-05');
	});

	// The forward arrow is disabled at today, so this is the hand-edited URL and
	// the double press. Either way the page stays on a day that can hold work.
	it('stops going forward at today', () => {
		expect(dailyWorkStep('2026-09-10', 1, '2026-09-10')).toBe('2026-09-10');
	});

	// The step is calendar arithmetic, not a subtraction of milliseconds, so the
	// two boundaries a zone offset would move are the ones worth stating.
	it('crosses a month boundary', () => {
		expect(dailyWorkStep('2026-09-01', -1, '2026-09-10')).toBe('2026-08-31');
	});

	it('crosses a year boundary', () => {
		expect(dailyWorkStep('2026-01-01', -1, '2026-09-10')).toBe('2025-12-31');
	});

	// Backward has no floor: a Profile's field work goes back as far as the
	// organization's records do.
	it('keeps going back past any bound but the calendar', () => {
		expect(dailyWorkStep('2019-03-01', -1, '2026-09-10')).toBe('2019-02-28');
	});
});

describe('DAILY_WORK_COPY', () => {
	it('hands a genuinely empty day to the frame, in day wording', () => {
		const state = activityPanelState(
			{ isLoading: false, isError: false, isEmpty: true },
			DAILY_WORK_COPY,
		);

		expect(state).toMatchObject({
			isEmpty: true,
			message: null,
			emptyTitle: 'Nothing recorded on this day',
		});
	});

	// Same reason: there is no range to narrow, so a failed read says to try
	// again rather than to move an end the page does not have.
	it('does not tell a reader to narrow a range after a failed read', () => {
		const state = activityPanelState(
			{ isLoading: false, isError: true, isEmpty: true },
			DAILY_WORK_COPY,
		);

		expect(state.message).toEqual({
			title: 'Activity could not be loaded',
			body: 'The read failed. Try again in a moment.',
		});
	});
});

describe('isProfileId', () => {
	it('accepts a UUID in either case', () => {
		expect(isProfileId('2f1b8c4e-9d3a-4f7b-8c21-5a6d7e8f9a0b')).toBe(true);
		expect(isProfileId('2F1B8C4E-9D3A-4F7B-8C21-5A6D7E8F9A0B')).toBe(true);
	});

	it('refuses anything that is not one', () => {
		expect(isProfileId('')).toBe(false);
		expect(isProfileId('me')).toBe(false);
		expect(isProfileId('2f1b8c4e9d3a4f7b8c215a6d7e8f9a0b')).toBe(false);
		expect(isProfileId('2f1b8c4e-9d3a-4f7b-8c21-5a6d7e8f9a0')).toBe(false);
	});
});

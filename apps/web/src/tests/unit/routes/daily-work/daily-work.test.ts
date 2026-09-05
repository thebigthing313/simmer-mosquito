import { describe, expect, it } from 'vitest';
import { ActivityRequestError, activityPanelState } from '../../../../routes/-activity-data';
import {
	DAILY_WORK_COPY,
	dailyWorkDay,
	dailyWorkWindow,
	isProfileId,
} from '../../../../routes/daily-work/-daily-work';

// Daily Work's pure half: which day the page is on, what that day asks the
// server for, and whether the path names a Profile at all. Each of the three has
// a wrong answer that shows nothing and says nothing about why.

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

describe('dailyWorkWindow', () => {
	// The endpoint reads a range. One day is both ends of it, and the server needs
	// no change to answer that.
	it('sends the chosen day as both ends of the window', () => {
		expect(dailyWorkWindow('profile-1', '2026-08-12')).toEqual({
			profileId: 'profile-1',
			dateFrom: '2026-08-12',
			dateTo: '2026-08-12',
		});
	});
});

describe('DAILY_WORK_COPY', () => {
	// A refusal is the server declining the question. Its own reason is the only
	// thing that says which day was declined and why, so the page repeats it
	// rather than replacing it with a generic failure.
	it('repeats the server’s own reason for a refused day', () => {
		const state = activityPanelState(
			{
				isLoading: false,
				error: new ActivityRequestError('That date is not a date.', true),
				isEmpty: true,
			},
			DAILY_WORK_COPY,
		);

		expect(state.message).toEqual({
			title: 'That day was not read',
			body: 'That date is not a date.',
		});
		// Not the frame's empty state: an empty day and a refused one must not look
		// the same, because one of them is a conclusion about a colleague.
		expect(state.isEmpty).toBe(false);
	});

	it('hands a genuinely empty day to the frame, in day wording', () => {
		const state = activityPanelState(
			{ isLoading: false, error: null, isEmpty: true },
			DAILY_WORK_COPY,
		);

		expect(state).toMatchObject({
			isEmpty: true,
			message: null,
			emptyTitle: 'Nothing recorded on this day',
		});
	});

	// One day has no second end to move, so there is nothing to advise.
	it('offers no advice about narrowing a capped log', () => {
		expect(DAILY_WORK_COPY.truncationAdvice).toBeNull();
	});

	// Same reason: there is no range to narrow, so a failed read says to try
	// again rather than to move an end the page does not have.
	it('does not tell a reader to narrow a range after a failed read', () => {
		const state = activityPanelState(
			{ isLoading: false, error: new Error('boom'), isEmpty: true },
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

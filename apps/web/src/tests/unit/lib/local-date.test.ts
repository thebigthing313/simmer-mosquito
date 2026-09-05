import { describe, expect, it } from 'vitest';
import {
	addCalendarDays,
	formatLocalDate,
	localDayStartAsTimestamp,
	localTimeAsInstant,
	localTimeOfDay,
	operationalDayAsInstant,
	parseLocalDate,
} from '../../../lib/local-date';

describe('parseLocalDate', () => {
	it('reads a calendar date as that day in local time', () => {
		const parsed = parseLocalDate('2026-08-04');
		expect(parsed?.getFullYear()).toBe(2026);
		expect(parsed?.getMonth()).toBe(7);
		expect(parsed?.getDate()).toBe(4);
	});

	it('does not shift the day the way Date parsing would', () => {
		// `new Date('2026-08-04')` is UTC midnight, which is 3 August in every zone
		// west of Greenwich. That off-by-one day is the reason this function exists.
		expect(parseLocalDate('2026-08-04')?.getDate()).toBe(new Date(2026, 7, 4).getDate());
	});

	it('ignores anything after the date part, so a timestamp still parses', () => {
		expect(parseLocalDate('2026-08-04T17:30:00Z')?.getDate()).toBe(4);
	});

	it('treats empty, null, and undefined alike as no date', () => {
		expect(parseLocalDate('')).toBeUndefined();
		expect(parseLocalDate(null)).toBeUndefined();
		expect(parseLocalDate(undefined)).toBeUndefined();
	});

	it('returns undefined rather than an Invalid Date', () => {
		expect(parseLocalDate('not-a-date')).toBeUndefined();
		expect(parseLocalDate('2026-08')).toBeUndefined();
	});
});

describe('formatLocalDate', () => {
	it('writes the local parts, zero-padded', () => {
		expect(formatLocalDate(new Date(2026, 0, 9))).toBe('2026-01-09');
	});

	it('round-trips a calendar date', () => {
		const value = '2026-12-31';
		expect(formatLocalDate(parseLocalDate(value) as Date)).toBe(value);
	});

	it('keeps the day it was given late in the evening', () => {
		// A local time that is already the next day in UTC — `toISOString().slice(0, 10)`
		// is the shortcut this replaces, and it reports tomorrow here.
		expect(formatLocalDate(new Date(2026, 7, 4, 23, 30))).toBe('2026-08-04');
	});
});

describe('addCalendarDays', () => {
	it('moves forward and back across a month boundary', () => {
		expect(addCalendarDays('2026-08-31', 1)).toBe('2026-09-01');
		expect(addCalendarDays('2026-09-01', -1)).toBe('2026-08-31');
		expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
	});

	it('crosses a spring-forward night without losing the day', () => {
		// The US changeover is the second Sunday in March. Done in local time this
		// day is 23 hours long, and adding 24 lands back on the day it started.
		expect(addCalendarDays('2026-03-07', 1)).toBe('2026-03-08');
		expect(addCalendarDays('2026-03-08', 1)).toBe('2026-03-09');
	});

	it('keeps the zero-padding a date column and a date input both need', () => {
		expect(addCalendarDays('2026-01-31', 1)).toBe('2026-02-01');
		expect(addCalendarDays('2026-08-04', 5)).toBe('2026-08-09');
	});

	it('hands back an unreadable date untouched', () => {
		// Rather than `NaN-NaN-NaN`, which reads as a date and is not one.
		expect(addCalendarDays('', 1)).toBe('');
		expect(addCalendarDays('not a date', 1)).toBe('not a date');
	});
});

describe('localDayStartAsTimestamp', () => {
	// How Electric puts a `timestamptz` on the wire: UTC, space separator, `+00`.
	// These assertions derive it from the same instant rather than hard-coding a
	// zone, so they hold wherever the suite runs.
	function asElectricTimestamp(date: Date): string {
		const iso = date.toISOString();
		return `${iso.slice(0, 10)} ${iso.slice(11, 19)}.481000+00`;
	}

	it('writes a timestamptz literal Electric accepts, not a bare date', () => {
		expect(localDayStartAsTimestamp('2026-07-24', undefined)).toMatch(
			/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\+00$/,
		);
	});

	it('names the instant local midnight began', () => {
		const bound = localDayStartAsTimestamp('2026-07-24', undefined);
		const asInstant = new Date(`${bound.replace(' ', 'T').replace('+00', 'Z')}`);
		expect(asInstant.getTime()).toBe(new Date(2026, 6, 24).getTime());
	});

	it('sorts as a string exactly where it sorts as an instant', () => {
		// The bound is compared twice — once by Electric, once by TanStack DB as a
		// plain JS string `>=`. Both have to land on the same boundary.
		const bound = localDayStartAsTimestamp('2026-07-24', undefined);
		expect(asElectricTimestamp(new Date(2026, 6, 24, 0, 0, 1)) >= bound).toBe(true);
		expect(asElectricTimestamp(new Date(2026, 6, 24, 12, 30)) >= bound).toBe(true);
		expect(asElectricTimestamp(new Date(2026, 6, 23, 23, 59, 59)) >= bound).toBe(false);
	});

	it('falls back to the epoch rather than an unusable bound', () => {
		expect(localDayStartAsTimestamp('not-a-date', undefined)).toBe('1970-01-01 00:00:00+00');
		expect(localDayStartAsTimestamp(null, undefined)).toBe('1970-01-01 00:00:00+00');
	});

	// The whole point of the zone argument: the same requested day has to mean the
	// same instant to every reader, not whichever midnight their laptop is on.
	it('starts the day where the organization does, not where the browser does', () => {
		// 2026-07-24 in New York is UTC-4 in July, so its midnight is 04:00Z.
		expect(localDayStartAsTimestamp('2026-07-24', 'America/New_York')).toBe(
			'2026-07-24 04:00:00+00',
		);
		// Tokyo is nine hours ahead and never observes daylight saving, so its
		// midnight is the *previous* UTC day.
		expect(localDayStartAsTimestamp('2026-07-24', 'Asia/Tokyo')).toBe('2026-07-23 15:00:00+00');
		expect(localDayStartAsTimestamp('2026-07-24', 'UTC')).toBe('2026-07-24 00:00:00+00');
	});

	// A zone's offset belongs to the *instant*, not to the zone. A bound computed
	// with one offset and reused across a season is an hour wrong for half of it —
	// enough to push an evening's work out of the window that asked for it.
	it('uses the offset the zone was actually in on that date', () => {
		// Eastern is UTC-5 in January and UTC-4 in July. Same zone, same function,
		// two different midnights.
		expect(localDayStartAsTimestamp('2026-01-15', 'America/New_York')).toBe(
			'2026-01-15 05:00:00+00',
		);
		expect(localDayStartAsTimestamp('2026-07-15', 'America/New_York')).toBe(
			'2026-07-15 04:00:00+00',
		);
	});

	it('lands on the right side of a daylight-saving changeover', () => {
		// US DST begins 2026-03-08 at 2am local and ends 2026-11-01 at 2am. Both
		// days *start* on the pre-change offset, which is what a lower bound needs:
		// reading the offset at midday instead would move each bound by an hour.
		expect(localDayStartAsTimestamp('2026-03-08', 'America/New_York')).toBe(
			'2026-03-08 05:00:00+00',
		);
		expect(localDayStartAsTimestamp('2026-11-01', 'America/New_York')).toBe(
			'2026-11-01 04:00:00+00',
		);
	});

	it('still names a first moment where local midnight does not exist', () => {
		// Chile springs forward at midnight, so 2026-09-06 has no 00:00 at all.
		// The bound settles on the first instant the day does have — 01:00 local —
		// rather than silently landing on the previous day.
		const bound = localDayStartAsTimestamp('2026-09-06', 'America/Santiago');
		const local = new Intl.DateTimeFormat('en-CA', {
			timeZone: 'America/Santiago',
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).format(new Date(bound.replace(' ', 'T').replace('+00', 'Z')));
		expect(local).toBe('2026-09-06');
	});

	it('falls back to the browser when the organization zone has not streamed yet', () => {
		expect(localDayStartAsTimestamp('2026-07-24', undefined)).toBe(
			localDayStartAsTimestamp('2026-07-24', ''),
		);
	});
});

describe('localTimeAsInstant', () => {
	it('names the instant a wall time falls on in the organization zone', () => {
		// 09:30 on 4 August is 13:30Z in New York, which is UTC-4 in August.
		expect(localTimeAsInstant('2026-08-04', '09:30', 'America/New_York')).toBe(
			'2026-08-04T13:30:00.000Z',
		);
	});

	it('keeps the typed day across a changeover later the same day', () => {
		// New Zealand springs forward at 2am on 2026-09-27, so 00:30 that morning is
		// still NZST — UTC+12, and 12:30Z the day before. Reading the offset at the
		// wall time treated as UTC finds the post-jump +13 instead and lands on
		// 23:30 on the 26th: an hour early, and a day wrong.
		expect(localTimeAsInstant('2026-09-27', '00:30', 'Pacific/Auckland')).toBe(
			'2026-09-26T12:30:00.000Z',
		);
	});
});

describe('operationalDayAsInstant', () => {
	/** Well clear of every day these tests stamp, so nothing clamps. */
	const LONG_AFTER = new Date('2027-01-01T00:00:00.000Z');

	it('stamps midday where the organization is, not midday UTC', () => {
		// New Zealand is UTC+12 in August, so its midday on the 4th is midnight UTC
		// that same morning. Stamped at noon UTC instead, the row is 01:00 on the
		// 5th in Auckland and every surface reads it back as the wrong day.
		expect(operationalDayAsInstant('2026-08-04', 'Pacific/Auckland', LONG_AFTER)).toBe(
			'2026-08-04T00:00:00.000Z',
		);
	});

	it('does not stamp today ahead of now', () => {
		// A collection keyed at 09:00 on the morning it was made. The
		// organization's midday is three hours out, and `validateOperationalDate`
		// rejects an operational date more than the clock-skew tolerance in the
		// future — so a bare midday stamp would refuse the most ordinary entry
		// there is.
		const morning = new Date('2026-08-04T13:00:00.000Z');
		expect(operationalDayAsInstant('2026-08-04', 'America/New_York', morning)).toBe(
			'2026-08-04T13:00:00.000Z',
		);
	});

	it('leaves a future day in the future rather than relabelling it as today', () => {
		// Pulling every ahead-of-now stamp back to now would quietly turn a
		// mistyped date into today's, and the row would look deliberate. The
		// clamp only applies while now is still on the day that was typed; past
		// that, the day stands and the domain refuses it.
		const morning = new Date('2026-08-04T13:00:00.000Z');
		expect(operationalDayAsInstant('2026-08-10', 'America/New_York', morning)).toBe(
			'2026-08-10T16:00:00.000Z',
		);
	});
});

describe('localTimeOfDay', () => {
	it('reads an instant back on the organization clock, not the browser one', () => {
		// The inverse of `localTimeAsInstant`: 13:30Z is 09:30 in New York in
		// August. A form that hydrates in the browser's zone and saves in the
		// organization's shows a due time nobody set the moment the two differ.
		expect(localTimeOfDay('2026-08-04T13:30:00.000Z', 'America/New_York')).toBe('09:30');
	});

	it('has no time to offer for an absent or unreadable instant', () => {
		expect(localTimeOfDay(null, 'America/New_York')).toBe('');
		expect(localTimeOfDay('not-an-instant', 'America/New_York')).toBe('');
	});
});

import { describe, expect, it } from 'vitest';
import { formatLocalDate, localDayStartAsTimestamp, parseLocalDate } from '../../../lib/local-date';

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
	it('starts the day where the agency does, not where the browser does', () => {
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

	it('falls back to the browser when the agency zone has not streamed yet', () => {
		expect(localDayStartAsTimestamp('2026-07-24', undefined)).toBe(
			localDayStartAsTimestamp('2026-07-24', ''),
		);
	});
});

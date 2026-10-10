import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { createOrganizationClock, type InstantStyle } from '../../../lib/organization-clock';

/**
 * The Organization's clock against a zone that changes its offset, so a case
 * that reads the wrong zone, or reads one offset for the whole year, fails.
 * New York is UTC-4 in August and UTC-5 in January, and springs forward at
 * 02:00 on 2026-03-08.
 */
const ZONE = 'America/New_York';

/** A fixed now: 22:00 on Aug 4 in New York, already 02:00 on Aug 5 in UTC. */
const NOW = new Date('2026-08-05T02:00:00Z');

const clockAt = (now: Date, zone = ZONE) => createOrganizationClock(zone, () => now);

let warn: MockInstance<typeof console.warn>;

beforeEach(() => {
	warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
	warn.mockRestore();
});

describe('formatInstant', () => {
	const clock = clockAt(NOW);

	it('writes each style on the Organization clock', () => {
		const summer = '2026-08-12T20:30:00Z';
		expect(clock.formatInstant(summer, 'dateTime')).toBe('Aug 12, 2026, 4:30 PM');
		expect(clock.formatInstant(summer, 'date')).toBe('Aug 12, 2026');
		expect(clock.formatInstant(summer, 'dueAt')).toBe('Aug 12, 4:30 PM');
		expect(clock.formatInstant(summer, 'time')).toBe('4:30 PM');
	});

	it('reads the offset at the instant, not one offset for the year', () => {
		// The same wall time an hour further from UTC, because January is standard
		// time in New York.
		expect(clock.formatInstant('2026-01-12T21:30:00Z', 'dateTime')).toBe('Jan 12, 2026, 4:30 PM');
		// 07:30 UTC on the spring-forward day is 03:30 daylight time: 02:30 never
		// happened that night.
		expect(clock.formatInstant('2026-03-08T07:30:00Z', 'time')).toBe('3:30 AM');
	});

	it('reads a time on the zone it was given, not the browser one', () => {
		// Two zones far enough apart that a formatter ignoring its zone would agree
		// with itself. These were the pinned cases on `formatScheduledStart`,
		// `formatDueAt` and the record-dates `formatDateTime`.
		const instant = new Date('2026-08-04T15:00:00Z');
		expect(clock.formatInstant(instant, 'dateTime')).toContain('11:00');
		expect(clockAt(NOW, 'America/Los_Angeles').formatInstant(instant, 'dateTime')).toContain(
			'8:00',
		);
		expect(clockAt(NOW, 'America/Los_Angeles').formatInstant(instant, 'dueAt')).toBe(
			'Aug 4, 8:00 AM',
		);
	});

	it('dates an evening instant on the Organization day, not the UTC one', () => {
		// The `formatRequestedAt` case: dating this in UTC puts a request on a day
		// nobody worked.
		expect(clock.formatInstant(NOW, 'date')).toBe('Aug 4, 2026');
		expect(clockAt(NOW, 'UTC').formatInstant(NOW, 'date')).toBe('Aug 5, 2026');
	});

	it('reads a parsed instant the same as the string it came from', () => {
		const instant = new Date('2026-08-04T20:30:00Z');
		for (const style of ['dateTime', 'date', 'dueAt', 'time', 'relative'] as const) {
			expect(clock.formatInstant(instant, style)).toBe(
				clock.formatInstant(instant.toISOString(), style),
			);
		}
	});

	it('answers null for null in every style, and warns about nothing', () => {
		for (const style of ['dateTime', 'date', 'dueAt', 'time', 'relative'] as const) {
			expect(clock.formatInstant(null, style)).toBeNull();
		}
		expect(warn).not.toHaveBeenCalled();
	});

	/**
	 * #609's rule, which three of the four copies broke three different ways: one
	 * answered `Unknown`, one an empty string, and one echoed a string in silence
	 * and answered empty for a bad `Date`. The value goes back and the warning
	 * names the style. Each case passes its own value, because a warning fires
	 * once per formatter and value.
	 */
	it.each<InstantStyle>([
		'dateTime',
		'date',
		'dueAt',
		'time',
		'relative',
	])('writes an unreadable %s string back and warns', (style) => {
		const value = `half past four (${style})`;
		expect(clock.formatInstant(value, style)).toBe(value);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain(`formatInstant (${style})`);
	});

	it('writes an Invalid Date back as what it is, and warns', () => {
		expect(clock.formatInstant(new Date('nonsense'), 'dueAt')).toBe('Invalid Date');
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('formatInstant (dueAt)');
	});
});

describe('the relative style', () => {
	const clock = clockAt(NOW);
	const before = (seconds: number) => new Date(NOW.getTime() - seconds * 1000);

	it('counts back from now while the span is under a week', () => {
		expect(clock.formatInstant(before(30), 'relative')).toBe('just now');
		expect(clock.formatInstant(before(3 * 60), 'relative')).toBe('3m ago');
		expect(clock.formatInstant(before(5 * 3600), 'relative')).toBe('5h ago');
		expect(clock.formatInstant(before(2 * 86_400), 'relative')).toBe('2d ago');
	});

	it('names the day past a week, with the year only outside this one', () => {
		expect(clock.formatInstant('2026-07-20T15:00:00Z', 'relative')).toBe('Jul 20');
		expect(clock.formatInstant('2025-12-20T15:00:00Z', 'relative')).toBe('Dec 20, 2025');
	});

	it('decides which year it is on the Organization clock', () => {
		// 03:00 UTC on Jan 1 is still New Year's Eve in New York, so a comment from
		// December is this year's there and last year's in UTC.
		const newYear = new Date('2027-01-01T03:00:00Z');
		const december = '2026-12-20T15:00:00Z';
		expect(clockAt(newYear).formatInstant(december, 'relative')).toBe('Dec 20');
		expect(clockAt(newYear, 'UTC').formatInstant(december, 'relative')).toBe('Dec 20, 2026');
	});
});

describe('today and dayOf', () => {
	it('names the Organization day across a midnight the UTC day has already passed', () => {
		expect(clockAt(NOW).today()).toBe('2026-08-04');
		expect(clockAt(NOW, 'UTC').today()).toBe('2026-08-05');
		expect(clockAt(NOW).dayOf(NOW)).toBe('2026-08-04');
		expect(clockAt(NOW).dayOf(NOW.toISOString())).toBe('2026-08-04');
		expect(clockAt(NOW, 'UTC').dayOf(NOW)).toBe('2026-08-05');
	});

	it('reads the day before the spring-forward the same way', () => {
		// 23:30 standard time on Mar 7, already Mar 8 in UTC.
		expect(clockAt(NOW).dayOf('2026-03-08T04:30:00Z')).toBe('2026-03-07');
	});

	it('answers empty for an absent or unreadable instant', () => {
		const clock = clockAt(NOW);
		expect(clock.dayOf(null)).toBe('');
		expect(clock.dayOf(undefined)).toBe('');
		expect(clock.dayOf('not a time')).toBe('');
	});
});

describe('an injected now', () => {
	it('moves now, today and the relative style together', () => {
		let current = NOW;
		const clock = createOrganizationClock(ZONE, () => current);
		const comment = new Date('2026-08-05T01:57:00Z');

		expect(clock.now()).toBe(NOW);
		expect(clock.today()).toBe('2026-08-04');
		expect(clock.formatInstant(comment, 'relative')).toBe('3m ago');

		current = new Date('2026-08-06T05:00:00Z');
		expect(clock.now()).toBe(current);
		expect(clock.today()).toBe('2026-08-06');
		expect(clock.formatInstant(comment, 'relative')).toBe('1d ago');
	});

	it('hands the zone back for the write-path helpers', () => {
		expect(clockAt(NOW).zone).toBe(ZONE);
	});
});

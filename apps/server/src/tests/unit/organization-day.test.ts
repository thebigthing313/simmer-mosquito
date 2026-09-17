import { describe, expect, it } from 'vitest';
import { todayInTimeZone } from '../../organization-day.js';

/**
 * One instant, two calendars. 2026-03-15T03:30Z is the evening of the 14th in
 * Los Angeles and already the 15th in UTC, so a caller reading the UTC day
 * would refuse a Los Angeles weather bucket dated today as "in the future".
 * The other side of midnight is Auckland, a day ahead of UTC through its
 * afternoon. The two weather modules used to carry a copy of this each, and
 * neither had a test (#1083).
 */
describe('todayInTimeZone', () => {
	it('is the previous day west of UTC', () => {
		const instant = new Date('2026-03-15T03:30:00Z');
		expect(todayInTimeZone('America/Los_Angeles', instant)).toBe('2026-03-14');
		expect(todayInTimeZone('UTC', instant)).toBe('2026-03-15');
	});

	it('is the next day east of UTC', () => {
		// 14:30Z on the 15th is 03:30 on the 16th in Auckland, on daylight time.
		const instant = new Date('2026-03-15T14:30:00Z');
		expect(todayInTimeZone('Pacific/Auckland', instant)).toBe('2026-03-16');
		expect(todayInTimeZone('UTC', instant)).toBe('2026-03-15');
	});

	it('returns year-month-day with zero-padded parts', () => {
		expect(todayInTimeZone('America/New_York', new Date('2026-01-02T12:00:00Z'))).toBe(
			'2026-01-02',
		);
	});

	it('reads the clock when no instant is given', () => {
		const utcDay = (date: Date) => date.toISOString().slice(0, 10);
		const before = utcDay(new Date());
		const today = todayInTimeZone('UTC');
		const after = utcDay(new Date());
		// The run can straddle midnight, so either side of it is the right answer.
		expect([before, after]).toContain(today);
	});
});

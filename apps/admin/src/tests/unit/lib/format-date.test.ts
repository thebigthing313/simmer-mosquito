import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatDate } from '../../../lib/format-date';

/**
 * The organization page's Created and Updated rows read the same on every
 * machine. The formatter passed `undefined` for the locale, so the wording was
 * the operator's browser's, which is the drift #683 swept out of `apps/web/src`
 * and #1116 widened to this app. Under `en-GB` the same options render
 * `4 Mar 2026`. The zone is pinned to UTC so the literal is one value and not
 * a machine's; which day an instant falls on is `dateStyle`'s reading of the
 * runtime zone, which this formatter has never taken and #1116 does not change.
 */
describe('formatDate', () => {
	let zone: string | undefined;

	beforeEach(() => {
		zone = process.env.TZ;
		process.env.TZ = 'UTC';
	});

	afterEach(() => {
		if (zone === undefined) {
			delete process.env.TZ;
		} else {
			process.env.TZ = zone;
		}
	});

	it('names the day in en-US wording whatever the machine locale', () => {
		expect(formatDate('2026-03-04T21:05:09.000Z')).toBe('Mar 4, 2026');
	});

	it('hands back what it was given when the value is not a date', () => {
		expect(formatDate('yesterday')).toBe('yesterday');
	});
});

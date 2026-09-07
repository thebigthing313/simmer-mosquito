/**
 * A service request's date, and what it does with a value it cannot read.
 *
 * One of the two formatters that builds a local `Date` on purpose: the formatter
 * names no zone, so the two cancel and the day is the day that was recorded.
 * #609 replaced the hand-rolled parse under it and left that arrangement alone,
 * which is what these cases hold.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatRequestDate } from '../../../../routes/public-engagement/-public-engagement-display';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	warn.mockRestore();
});

describe('formatRequestDate', () => {
	// The label is the reader's locale, so the day is what is asserted rather
	// than the wording.
	it('renders the day the request was raised, whatever zone the reader is in', () => {
		const label = formatRequestDate('2026-08-04');
		expect(label).toContain('4');
		expect(label).toContain('2026');
		expect(label).not.toContain('3');
	});

	it('reads the day a timestamp begins on', () => {
		expect(formatRequestDate('2026-08-04T23:30:00Z')).toBe(formatRequestDate('2026-08-04'));
	});

	it('hands back a date it cannot read, and says so', () => {
		expect(formatRequestDate('4 August')).toBe('4 August');
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('formatRequestDate');
	});
});

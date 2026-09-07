/**
 * The date on a map card, and what it does with a value it cannot read.
 *
 * One of the ten places that read a leading `YYYY-MM-DD` by hand before #609.
 * It already echoed the input back, which is now the rule everywhere; what it
 * did not do was say so.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMapCardDate } from '../../../../components/map/map-card';

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
	warn.mockRestore();
});

describe('formatMapCardDate', () => {
	it('writes the calendar day in full', () => {
		expect(formatMapCardDate('2026-07-24')).toBe('July 24, 2026');
	});

	// A date column is a day. Read as an instant it renders as the 23rd in every
	// zone west of Greenwich, which is the whole reason the parts are read out.
	it('does not shift the day', () => {
		expect(formatMapCardDate('2026-07-24T02:00:00Z')).toBe('July 24, 2026');
	});

	it('hands back a date it cannot read, and says so', () => {
		expect(formatMapCardDate('24 July')).toBe('24 July');
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('formatMapCardDate');
	});
});

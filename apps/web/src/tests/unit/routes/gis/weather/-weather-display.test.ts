/**
 * What the weather summary formatters answer when a reading is missing.
 *
 * Both used to return an em dash themselves, which is how a formatter came to
 * hold a display string: the table drew whatever came back and never knew a
 * cell was empty. They return `null` now, and the card renders `AbsentValue`
 * over it, so one component draws the absence on every screen.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	formatDate,
	formatMeasure,
	formatRange,
} from '../../../../../routes/gis/weather/-weather-display';

describe('formatMeasure', () => {
	it('answers null for a reading the summary does not carry', () => {
		expect(formatMeasure(null, 'in')).toBeNull();
	});

	it('reads a zero as a reading, not as an absence', () => {
		expect(formatMeasure(0, 'in')).toBe('0in');
	});

	it('writes the value against its unit', () => {
		expect(formatMeasure(1.25, 'in')).toBe('1.25in');
	});
});

describe('formatRange', () => {
	it('answers null when neither end was recorded', () => {
		expect(formatRange(null, null, 'F')).toBeNull();
	});

	it('writes both ends when both were recorded', () => {
		expect(formatRange(52, 78, 'F')).toBe('52–78F');
	});

	it('writes one value when the two ends agree', () => {
		expect(formatRange(64, 64, 'F')).toBe('64F');
	});

	it('writes the end it has when only one was recorded', () => {
		expect(formatRange(null, 78, 'F')).toBe('78F');
		expect(formatRange(52, null, 'F')).toBe('52F');
	});
});

/**
 * A summary's day, which is the third thing this module formats.
 *
 * The month name is looked up from a list here rather than rendered through
 * `Intl`, which is why a month outside 1 to 12 is unreadable on this screen and
 * only rolls over on the others. Before #609 it printed the number.
 */
describe('formatDate', () => {
	let warn: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
	});

	afterEach(() => {
		warn.mockRestore();
	});

	it('writes the day the summary covers', () => {
		expect(formatDate('2026-03-09')).toBe('Mar 9, 2026');
	});

	it('reads the day a timestamp begins on', () => {
		expect(formatDate('2026-03-09T23:00:00Z')).toBe('Mar 9, 2026');
	});

	it('hands back a date it cannot read, and says so', () => {
		expect(formatDate('March the ninth')).toBe('March the ninth');
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toContain('formatDate');
	});

	it('refuses a month it has no name for rather than printing the number', () => {
		expect(formatDate('2026-13-09')).toBe('2026-13-09');
	});
});

/**
 * What the weather summary formatters answer when a reading is missing.
 *
 * Both used to return an em dash themselves, which is how a formatter came to
 * hold a display string: the table drew whatever came back and never knew a
 * cell was empty. They return `null` now, and the card renders `AbsentValue`
 * over it, so one component draws the absence on every screen.
 */

import { describe, expect, it } from 'vitest';
import { formatMeasure, formatRange } from '../../../../../routes/gis/weather/-weather-display';

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

/**
 * What the manual summary form makes of the seven metric boxes.
 *
 * Two rules, and both have a wrong answer that would go unnoticed.
 *
 * **An empty box is a reading of `null`, not a refusal.** That is how a value is
 * cleared, and clearing is the commoner correction — a misread gauge is fixed by
 * emptying the box, not by typing a different wrong number. Treating empty as
 * invalid would make the form unable to undo a mistake it had let the user make.
 *
 * **Extra precision fails rather than rounds.** The domain refuses more than two
 * decimal places instead of rounding, because rounding is the form deciding what
 * a person meant. (The spreadsheet import rounds instead, and deliberately: a
 * cell showing 1.25 can hold 1.2500000000000002, which is float noise rather
 * than a claim about precision. See `-import-parse.ts`.)
 */

import { describe, expect, it } from 'vitest';
import { parseMetrics } from '../../../../../routes/gis/weather/-weather-summary-dialog';

const EMPTY = {
	temperatureMinF: '',
	temperatureMaxF: '',
	precipitationInches: '',
	relativeHumidityMin: '',
	relativeHumidityMax: '',
	windSpeedMinMph: '',
	windSpeedMaxMph: '',
};

describe('reading the metric boxes', () => {
	it('reads an empty box as no reading', () => {
		expect(parseMetrics(EMPTY)).toEqual({
			temperatureMinF: null,
			temperatureMaxF: null,
			precipitationInches: null,
			relativeHumidityMin: null,
			relativeHumidityMax: null,
			windSpeedMinMph: null,
			windSpeedMaxMph: null,
		});
	});

	it('reads the boxes that hold numbers', () => {
		expect(
			parseMetrics({ ...EMPTY, precipitationInches: '1.25', temperatureMaxF: '78' }),
		).toMatchObject({ precipitationInches: 1.25, temperatureMaxF: 78 });
	});

	it('reads a negative temperature', () => {
		// The bound is -100°F, so below zero is ordinary rather than a typo.
		expect(parseMetrics({ ...EMPTY, temperatureMinF: '-12.5' })).toMatchObject({
			temperatureMinF: -12.5,
		});
	});

	it('refuses more than two decimal places rather than rounding them away', () => {
		expect(parseMetrics({ ...EMPTY, precipitationInches: '1.256' })).toBeNull();
	});

	it('accepts exactly two', () => {
		expect(parseMetrics({ ...EMPTY, precipitationInches: '1.25' })).not.toBeNull();
	});

	it('refuses a box holding something that is not a number', () => {
		expect(parseMetrics({ ...EMPTY, precipitationInches: 'trace' })).toBeNull();
	});

	it('ignores the whitespace a paste leaves behind', () => {
		expect(parseMetrics({ ...EMPTY, precipitationInches: '  1.25  ' })).toMatchObject({
			precipitationInches: 1.25,
		});
	});
});

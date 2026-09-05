/**
 * What a file would do to a station, before anything is written.
 *
 * This is the step the spec asks for by name and the branch originally shipped
 * without: "Web assesses rows against loaded existing station summaries", and
 * then "User reviews insert/update/no-change/fail counts and row details".
 *
 * Its second job is the one with teeth. Only rows this pass does not fail are
 * submitted, so a file whose own lines collide is resolved here, against a
 * screen, rather than becoming an argument about the whole batch at the server.
 */

import { describe, expect, it } from 'vitest';
import type { WeatherSummaryListing } from '../../../../../hooks/queries/use-weather-summaries';
import { assessParsedRows } from '../../../../../routes/gis/weather/-import-assessment';
import type { ParsedSummaryRow } from '../../../../../routes/gis/weather/-import-parse';

function parsed(line: number, startDate: string, overrides: Partial<ParsedSummaryRow> = {}) {
	return {
		line,
		startDate,
		endDate: startDate,
		temperatureMinF: null,
		temperatureMaxF: null,
		precipitationInches: 1,
		relativeHumidityMin: null,
		relativeHumidityMax: null,
		windSpeedMinMph: null,
		windSpeedMaxMph: null,
		...overrides,
	} satisfies ParsedSummaryRow;
}

function stored(id: string, startDate: string, overrides: Partial<WeatherSummaryListing> = {}) {
	return {
		id,
		startDate,
		endDate: startDate,
		temperatureMinF: null,
		temperatureMaxF: null,
		precipitationInches: 1,
		relativeHumidityMin: null,
		relativeHumidityMax: null,
		windSpeedMinMph: null,
		windSpeedMaxMph: null,
		...overrides,
	} satisfies WeatherSummaryListing;
}

/** Far enough ahead that no fixture date reads as the future. */
const TODAY = '2099-12-31';

/** Predictable ids, so a verdict can be checked against the row it names. */
function ids() {
	let next = 0;
	return () => {
		next += 1;
		return `00000000-0000-4000-8000-${String(next).padStart(12, '0')}`;
	};
}

describe('assessing a file against a station', () => {
	it('calls a bucket the station does not hold an insert', () => {
		const result = assessParsedRows([parsed(2, '2026-06-01')], [], ids(), TODAY);

		expect(result.counts).toMatchObject({ insert: 1, update: 0, noChange: 0, fail: 0 });
		expect(result.attemptable).toHaveLength(1);
		expect(result.hasUpdates).toBe(false);
	});

	it('calls a bucket with different readings an overwrite', () => {
		const result = assessParsedRows(
			[parsed(2, '2026-06-01', { precipitationInches: 5 })],
			[stored('s1', '2026-06-01')],
			ids(),
			TODAY,
		);

		expect(result.counts).toMatchObject({ update: 1 });
		// What the acknowledgement gate turns on, so the page can ask before
		// sending rather than only after being refused.
		expect(result.hasUpdates).toBe(true);
	});

	it('calls a bucket that already says this a no-change', () => {
		const result = assessParsedRows(
			[parsed(2, '2026-06-01')],
			[stored('s1', '2026-06-01')],
			ids(),
			TODAY,
		);

		expect(result.counts).toMatchObject({ noChange: 1, update: 0 });
	});

	/**
	 * The case the whole assessment step exists for.
	 *
	 * An hourly export collapsed onto a date column produces exactly this. The
	 * later row fails and the earlier one still writes, which is the spec's rule:
	 * "the first valid row wins by submitted order".
	 */
	it('fails only the later of two rows sharing a bucket', () => {
		const result = assessParsedRows(
			[parsed(2, '2026-06-01'), parsed(3, '2026-06-01'), parsed(4, '2026-06-02')],
			[],
			ids(),
			TODAY,
		);

		expect(result.rows.map((row) => row.action)).toEqual(['insert', 'fail', 'insert']);
		// The failed line never travels, so the server is not asked to write a row
		// the user has already been shown as unwritable.
		expect(result.attemptable).toHaveLength(2);
		expect(result.hasFailures).toBe(true);
	});

	it('fails a bucket that straddles one the station holds', () => {
		const result = assessParsedRows(
			[parsed(2, '2026-06-02', { endDate: '2026-06-04' })],
			[stored('s1', '2026-06-01', { endDate: '2026-06-03' })],
			ids(),
			TODAY,
		);

		expect(result.rows[0]?.action).toBe('fail');
		expect(result.rows[0]?.issues[0]?.path).toBe('dateRange');
		expect(result.attemptable).toEqual([]);
	});

	// The line number is what the server's per-row answer comes back keyed by, and
	// what the failure list points at. A blank row in the middle of a file already
	// makes this easy to get wrong once.
	it('carries the spreadsheet line through as the row id', () => {
		const result = assessParsedRows([parsed(84, '2026-06-01')], [], ids(), TODAY);

		expect(result.rows[0]?.line).toBe(84);
		expect(result.attemptable[0]?.clientRowId).toBe('84');
	});

	// The review has to agree with the server about which rows are future-dated,
	// or the screen says "Add" for a line the commit is about to refuse.
	it('fails a row dated after the organization today', () => {
		const result = assessParsedRows([parsed(2, '2026-06-30')], [], ids(), '2026-06-15');

		expect(result.rows[0]?.action).toBe('fail');
		expect(result.attemptable).toEqual([]);
	});

	it('mints one id per row, for the inserts to carry', () => {
		const result = assessParsedRows(
			[parsed(2, '2026-06-01'), parsed(3, '2026-06-02')],
			[],
			ids(),
			TODAY,
		);

		const minted = result.attemptable.map((row) => row.weatherSummaryId);
		expect(new Set(minted).size).toBe(2);
	});
});

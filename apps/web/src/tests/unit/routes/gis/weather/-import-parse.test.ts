/**
 * Reading a spreadsheet of weather readings.
 *
 * All of the parsing is client work — the server never sees a file — so this is
 * the only thing standing between a gauge log and the rows a commit writes. Two
 * of its rules have a wrong answer that looks right:
 *
 * **Dates.** A date cell is a calendar day with no zone attached. Reading it
 * through `toISOString` shifts it a day backwards for anyone west of Greenwich,
 * which would file every reading in a California agency's file against the wrong
 * day — and the wrongness is invisible, because the row still looks like a date.
 *
 * **Blank versus bad.** An empty cell means "no reading" and has to survive as a
 * null; a cell holding `n/a` is a broken line and has to be reported. Collapsing
 * the two either drops readings silently or fails whole files over trailing
 * blanks.
 */

import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import {
	IMPORT_COLUMNS,
	MAX_IMPORT_ROWS,
	parseWeatherFile,
} from '../../../../../routes/gis/weather/-import-parse';

/** A `File` holding a real workbook, so the parser is exercised end to end. */
function workbookFile(rows: readonly (readonly unknown[])[], name = 'readings.xlsx'): File {
	const sheet = XLSX.utils.aoa_to_sheet(rows as unknown[][]);
	const book = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
	const buffer = XLSX.write(book, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer;
	return new File([buffer], name);
}

describe('parsing a weather spreadsheet', () => {
	it('maps headers however the export spelled them', async () => {
		const result = await parseWeatherFile(
			workbookFile([
				['Date', 'Precip (in)', 'Max Temp', 'MIN TEMP'],
				['2026-06-01', 1.25, 78.5, 54],
			]),
		);

		expect(result.error).toBeUndefined();
		expect(result.rows).toEqual([
			expect.objectContaining({
				line: 2,
				startDate: '2026-06-01',
				// No end column, so a single-day bucket stores the date twice.
				endDate: '2026-06-01',
				precipitationInches: 1.25,
				temperatureMaxF: 78.5,
				temperatureMinF: 54,
				relativeHumidityMin: null,
			}),
		]);
	});

	it('names the columns it did not recognise rather than guessing by position', async () => {
		const result = await parseWeatherFile(
			workbookFile([
				['Date', 'Precip', 'Soil pH', 'Observer'],
				['2026-06-01', 0.5, 6.8, 'RM'],
			]),
		);

		// Positional reading would have filed soil pH as a temperature. Saying so is
		// what lets someone fix their file.
		expect(result.unmappedColumns).toEqual(['Soil pH', 'Observer']);
		expect(result.rows[0]).toMatchObject({ precipitationInches: 0.5, temperatureMinF: null });
	});

	it('refuses a file with no date column instead of reading it anyway', async () => {
		const result = await parseWeatherFile(
			workbookFile([
				['Precip', 'Max Temp'],
				[0.5, 78],
			]),
		);

		expect(result.rows).toEqual([]);
		expect(result.error).toContain('date column');
	});

	/**
	 * The trap this test exists for.
	 *
	 * `cellDates` hands back a real `Date` for a date cell, and its parts have to
	 * be read locally. Through `toISOString` this same cell reads as 2026-05-31 in
	 * any negative-offset zone, and the file would be off by a day for exactly the
	 * agencies most likely to be using it.
	 */
	it('reads a real date cell as the day it shows, not the day UTC calls it', async () => {
		const sheet = XLSX.utils.aoa_to_sheet([
			['Date', 'Precip'],
			[new Date(2026, 5, 1), 0.5],
		]);
		const book = XLSX.utils.book_new();
		XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
		const buffer = XLSX.write(book, { bookType: 'xlsx', type: 'array', cellDates: true });
		const file = new File([buffer as ArrayBuffer], 'dates.xlsx');

		const result = await parseWeatherFile(file);

		expect(result.rows[0]?.startDate).toBe('2026-06-01');
	});

	it('reads a US text date', async () => {
		const result = await parseWeatherFile(
			workbookFile([
				['Date', 'Precip'],
				['6/1/2026', 0.5],
			]),
		);

		expect(result.rows[0]?.startDate).toBe('2026-06-01');
	});

	it('keeps a multi-day bucket when the file names both ends', async () => {
		const result = await parseWeatherFile(
			workbookFile([
				['Start', 'End', 'Rainfall'],
				['2026-06-01', '2026-06-03', 2.5],
			]),
		);

		expect(result.rows[0]).toMatchObject({ startDate: '2026-06-01', endDate: '2026-06-03' });
	});

	it('skips a line whose end date precedes its start', async () => {
		const result = await parseWeatherFile(
			workbookFile([
				['Start', 'End', 'Rainfall'],
				['2026-06-03', '2026-06-01', 2.5],
				['2026-06-04', '2026-06-05', 1],
			]),
		);

		expect(result.rejected).toEqual([
			{ line: 2, reason: 'The end date is before the start date.' },
		]);
		// The good line still comes through. A file is reviewed and committed as a
		// whole, so one bad line must not cost the other four hundred.
		expect(result.rows).toHaveLength(1);
	});

	it('tells an empty reading apart from an unreadable one', async () => {
		const result = await parseWeatherFile(
			workbookFile([
				['Date', 'Precip', 'Max Temp'],
				['2026-06-01', '', 78],
				['2026-06-02', 'n/a', 71],
			]),
		);

		// Blank is a real answer: this station recorded temperature and not rain.
		expect(result.rows[0]).toMatchObject({ precipitationInches: null, temperatureMaxF: 78 });
		// `n/a` is not. The reason names the metric the way the person reading it
		// would, not the way the payload does.
		expect(result.rejected).toEqual([{ line: 3, reason: 'The precipitation is not a number.' }]);
	});

	it('drops a line with no readings at all rather than sending it to fail', async () => {
		const result = await parseWeatherFile(
			workbookFile([
				['Date', 'Precip'],
				['2026-06-01', ''],
			]),
		);

		// The server would fail it anyway. Failing it here keeps it out of the
		// 5,000-row budget and names it against a line number.
		expect(result.rows).toEqual([]);
		expect(result.rejected).toEqual([{ line: 2, reason: 'No readings on this line.' }]);
	});

	it('ignores the blank rows an export trails', async () => {
		const result = await parseWeatherFile(
			workbookFile([
				['Date', 'Precip'],
				['2026-06-01', 0.5],
				['', ''],
			]),
		);

		// Not a failure, and not a deletion request. Most exports end this way.
		expect(result.rows).toHaveLength(1);
		expect(result.rejected).toEqual([]);
	});

	// Float noise a spreadsheet carries but does not show. The domain refuses more
	// than two decimals rather than rounding, so a file failing over a value the
	// user can see as 1.25 would be reporting a problem that is not in their
	// document.
	it('rounds a cell to the two decimals the domain accepts', async () => {
		const result = await parseWeatherFile(
			workbookFile([
				['Date', 'Precip'],
				['2026-06-01', 1.2500000000000002],
			]),
		);

		expect(result.rows[0]?.precipitationInches).toBe(1.25);
	});

	it('cuts a file at the row limit and says it did', async () => {
		const rows: unknown[][] = [['Date', 'Precip']];
		for (let index = 0; index < MAX_IMPORT_ROWS + 5; index += 1) {
			rows.push([`2026-06-${String((index % 28) + 1).padStart(2, '0')}`, 1]);
		}

		const result = await parseWeatherFile(workbookFile(rows));

		expect(result.rows).toHaveLength(MAX_IMPORT_ROWS);
		// Said rather than silent: a truncation nobody mentions reads as a complete
		// import that quietly lost the tail.
		expect(result.truncated).toBe(true);
	});

	it('reports a file it cannot read at all', async () => {
		const result = await parseWeatherFile(new File(['not a spreadsheet'], 'notes.txt'));

		expect(result.rows).toEqual([]);
		expect(result.error).toBeDefined();
	});
});

describe('header spellings', () => {
	// The screenshot of a real preview is what found this: a file headed "Max RH"
	// parsed cleanly, reported the column as unrecognised, and imported without the
	// humidity nobody noticed was missing. An alias gap fails silently in the one
	// direction that matters.
	it.each([
		['Max RH', 'relativeHumidityMax'],
		['Min RH', 'relativeHumidityMin'],
		['High', 'temperatureMaxF'],
		['Low', 'temperatureMinF'],
		['Max Wind Speed', 'windSpeedMaxMph'],
		['Rainfall', 'precipitationInches'],
	])('reads %s as %s', async (header, field) => {
		const result = await parseWeatherFile(
			workbookFile([
				['Date', header],
				['2026-06-01', 42],
			]),
		);

		expect(result.unmappedColumns).toEqual([]);
		expect(result.rows[0]).toMatchObject({ [field]: 42 });
	});
});

/**
 * What the upload screen offers before a file is chosen.
 *
 * The screen used to say none of it, so a user learned the headings by
 * uploading a file and reading back what went unmapped. The point of the list
 * is that it comes off the same map the parser matches with: a heading the
 * screen offers has to be one a file can actually be named with.
 */
describe('the columns the upload screen names', () => {
	it('requires the date and recommends the rest', () => {
		expect(IMPORT_COLUMNS.required.map((column) => column.label)).toEqual(['Date']);
		expect(IMPORT_COLUMNS.recommended.map((column) => column.label)).toEqual([
			'End date',
			'Minimum temperature',
			'Maximum temperature',
			'Precipitation',
			'Minimum humidity',
			'Maximum humidity',
			'Minimum wind speed',
			'Maximum wind speed',
		]);
	});

	it('offers headings the parser really maps', async () => {
		const offered = [...IMPORT_COLUMNS.required, ...IMPORT_COLUMNS.recommended];
		expect(offered.every((column) => column.headings.length > 0)).toBe(true);

		// One heading from each column, through the parser, in a file that names
		// every column by an offered spelling.
		const headings = offered.flatMap((column) =>
			column.headings[0] === undefined ? [] : [column.headings[0]],
		);
		const result = await parseWeatherFile(
			workbookFile([[...headings], ['2026-06-01', '2026-06-01', 54, 78, 1.25, 21, 58, 2, 11]]),
		);

		expect(result.unmappedColumns).toEqual([]);
		expect(result.error).toBeUndefined();
		expect(result.rows).toHaveLength(1);
	});
});

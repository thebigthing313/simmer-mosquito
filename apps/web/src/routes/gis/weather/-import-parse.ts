/**
 * A spreadsheet of weather readings, turned into SIMMER-shaped summary rows.
 *
 * All of this is client work by design. `docs/weather-domain.md` puts parsing,
 * column mapping and unit conversion in the browser so the server never sees a
 * CSV — what crosses the wire is already normalized rows in canonical units, and
 * the server's job is to decide which of them may be written, not what they say.
 *
 * ## Reading the file
 *
 * SheetJS handles `.csv`, `.xls` and `.xlsx` through one call, and it is loaded
 * with a dynamic `import()` so it stays out of the boot bundle — it is several
 * hundred kilobytes that only this page ever needs, and a static import would put
 * it on every page load in the app.
 *
 * The package comes from SheetJS's own registry rather than npm. The npm `xlsx`
 * package stopped at 0.18.5 and carries an unfixed prototype-pollution advisory
 * (CVE-2023-30533) that fires precisely on this use — reading an untrusted file —
 * so the pinned tarball in `apps/web/package.json` is the maintained build.
 *
 * ## Mapping columns
 *
 * Header names are matched case- and punctuation-insensitively against a list of
 * spellings per field, because "Precip (in)", "precipitation_inches" and
 * "RAINFALL" are the same column in three different exports. Nothing is guessed
 * positionally: a file whose headers do not match is reported as unmapped rather
 * than read in whatever order it happened to arrive.
 *
 * ## Units
 *
 * Values are taken as already canonical — Fahrenheit, inches, percent, miles per
 * hour — because that is what a US agency's gauge and station exports carry. A
 * file in Celsius or millimetres is out of scope for v1 and would need a unit
 * picker in the review step rather than a guess here.
 */

/** The header spellings that map to each canonical field. */
const COLUMN_ALIASES: Readonly<Record<string, readonly string[]>> = {
	startDate: ['startdate', 'start', 'date', 'begindate', 'from', 'observationdate', 'day'],
	endDate: ['enddate', 'end', 'through', 'to', 'todate'],
	temperatureMinF: ['temperatureminf', 'mintemp', 'tempmin', 'tmin', 'mintemperature', 'lowf'],
	temperatureMaxF: ['temperaturemaxf', 'maxtemp', 'tempmax', 'tmax', 'maxtemperature', 'highf'],
	precipitationInches: ['precipitationinches', 'precipitation', 'precip', 'rain', 'rainfall'],
	relativeHumidityMin: ['relativehumiditymin', 'humiditymin', 'minhumidity', 'rhmin'],
	relativeHumidityMax: ['relativehumiditymax', 'humiditymax', 'maxhumidity', 'rhmax'],
	windSpeedMinMph: ['windspeedminmph', 'windmin', 'minwind', 'windspeedmin'],
	windSpeedMaxMph: ['windspeedmaxmph', 'windmax', 'maxwind', 'windspeedmax', 'gust'],
};

const METRIC_FIELDS = [
	'temperatureMinF',
	'temperatureMaxF',
	'precipitationInches',
	'relativeHumidityMin',
	'relativeHumidityMax',
	'windSpeedMinMph',
	'windSpeedMaxMph',
] as const;

/** One spreadsheet line, as the import command takes it. */
export interface ParsedSummaryRow {
	/** The spreadsheet line number, so a failure can be pointed at. */
	readonly line: number;
	readonly startDate: string;
	readonly endDate: string;
	readonly temperatureMinF: number | null;
	readonly temperatureMaxF: number | null;
	readonly precipitationInches: number | null;
	readonly relativeHumidityMin: number | null;
	readonly relativeHumidityMax: number | null;
	readonly windSpeedMinMph: number | null;
	readonly windSpeedMaxMph: number | null;
}

export interface ParseResult {
	readonly rows: readonly ParsedSummaryRow[];
	/** Header cells that matched no canonical field, for the review step to name. */
	readonly unmappedColumns: readonly string[];
	/** Lines dropped before the server ever sees them, with why. */
	readonly rejected: readonly { readonly line: number; readonly reason: string }[];
	/** True when the file held more than {@link MAX_IMPORT_ROWS} and the rest were cut. */
	readonly truncated: boolean;
	/** Set when the file could not be read at all. */
	readonly error?: string;
}

/** The server's cap, restated so a 5,001-row file is refused before it is sent. */
export const MAX_IMPORT_ROWS = 5000;

export const IMPORT_FILE_ACCEPT = '.csv,.xls,.xlsx,.xlsm';

/**
 * Read a spreadsheet into summary rows.
 *
 * Never throws for a bad file: an unreadable one comes back as `error`, and a bad
 * line comes back in `rejected`. The caller is a review screen, and a screen that
 * shows "3 of 400 lines could not be read, here they are" is more use than one
 * that shows nothing because line 3 had a typo.
 */
export async function parseWeatherFile(file: File): Promise<ParseResult> {
	let table: readonly (readonly unknown[])[];
	try {
		const XLSX = await import('xlsx');
		const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
		const firstSheetName = workbook.SheetNames[0];
		const sheet = firstSheetName === undefined ? undefined : workbook.Sheets[firstSheetName];
		if (sheet === undefined) {
			return empty('That file has no sheets in it.');
		}
		// `header: 1` gives rows as arrays rather than objects keyed by header, so
		// the mapping below is this module's rather than SheetJS's — two columns
		// with the same header would otherwise silently collapse into one.
		table = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, blankrows: false });
	} catch {
		return empty('That file could not be read as a spreadsheet.');
	}

	const headerRow = table[0];
	if (headerRow === undefined) {
		return empty('That file is empty.');
	}

	const { columns, unmapped } = mapColumns(headerRow);
	if (columns.startDate === undefined) {
		return {
			rows: [],
			unmappedColumns: unmapped,
			rejected: [],
			truncated: false,
			error: 'No date column was found. The first row must name the columns.',
		};
	}

	const rows: ParsedSummaryRow[] = [];
	const rejected: { readonly line: number; readonly reason: string }[] = [];
	let truncated = false;

	for (let index = 1; index < table.length; index += 1) {
		const cells = table[index];
		if (cells === undefined || cells.every(isBlank)) {
			// A blank line is not a deletion request, and not a failure either — a
			// trailing empty row is how most exports end.
			continue;
		}
		if (rows.length >= MAX_IMPORT_ROWS) {
			truncated = true;
			break;
		}

		// Spreadsheet line numbers are 1-based and the header is line 1.
		const read = readLine(cells, columns, index + 1);
		if ('reason' in read) {
			rejected.push(read);
			continue;
		}
		rows.push(read);
	}

	return { rows, unmappedColumns: unmapped, rejected, truncated };
}

/** One spreadsheet line, or why it cannot become a reading. */
type LineResult = ParsedSummaryRow | { readonly line: number; readonly reason: string };

/**
 * Turn one line into a row, or say what is wrong with it.
 *
 * Every refusal names the line, because the review screen's job is to let someone
 * open their own file and fix it — "3 rows were skipped" is a dead end, "line 84
 * has no readings" is not.
 */
function readLine(
	cells: readonly unknown[],
	columns: Partial<Record<string, number>>,
	line: number,
): LineResult {
	const startColumn = columns.startDate;
	const startDate = startColumn === undefined ? null : readDate(cells[startColumn]);
	if (startDate === null) {
		return { line, reason: 'The date could not be read.' };
	}
	const endDate =
		columns.endDate === undefined ? startDate : (readDate(cells[columns.endDate]) ?? startDate);
	if (endDate < startDate) {
		return { line, reason: 'The end date is before the start date.' };
	}

	const metrics = readMetrics(cells, columns);
	if (typeof metrics === 'string') {
		return { line, reason: `${metrics} is not a number.` };
	}
	if (METRIC_FIELDS.every((field) => metrics[field] === null)) {
		// A line with nothing on it. The server would fail it anyway; failing it here
		// keeps it out of the 5,000-row budget and names it against a line number.
		return { line, reason: 'No readings on this line.' };
	}

	return { line, startDate, endDate, ...metrics } as ParsedSummaryRow;
}

/** The seven readings, or the name of the first field whose cell is not a number. */
function readMetrics(
	cells: readonly unknown[],
	columns: Partial<Record<string, number>>,
): Record<string, number | null> | string {
	const metrics: Record<string, number | null> = {};
	for (const field of METRIC_FIELDS) {
		const column = columns[field];
		// A column the file does not have is not a bad cell: most exports carry three
		// of the seven metrics, and the rest are simply absent.
		if (column === undefined) {
			metrics[field] = null;
			continue;
		}
		const value = readNumber(cells[column]);
		if (value === undefined) {
			return field;
		}
		metrics[field] = value;
	}
	return metrics;
}

// --- helpers ----------------------------------------------------------------

function empty(error: string): ParseResult {
	return { rows: [], unmappedColumns: [], rejected: [], truncated: false, error };
}

/** Which spreadsheet column holds each canonical field, and what matched nothing. */
function mapColumns(headerRow: readonly unknown[]): {
	readonly columns: Partial<Record<string, number>>;
	readonly unmapped: readonly string[];
} {
	const columns: Record<string, number> = {};
	const unmapped: string[] = [];

	headerRow.forEach((cell, index) => {
		const header = String(cell ?? '').trim();
		if (header.length === 0) {
			return;
		}
		const normalized = normalizeHeader(header);
		const field = Object.keys(COLUMN_ALIASES).find(
			(name) => COLUMN_ALIASES[name]?.includes(normalized) === true,
		);
		if (field === undefined) {
			unmapped.push(header);
			return;
		}
		// First column wins. A file with two "precip" columns is ambiguous, and
		// taking the later one silently would depend on column order nobody stated.
		columns[field] ??= index;
	});

	return { columns, unmapped };
}

/**
 * Strip everything a header might vary by: case, spaces, punctuation, and the
 * unit a column names itself with.
 *
 * The bracketed unit has to go before the punctuation does, or "Precip (in)"
 * collapses to `precipin` and matches nothing — which is how the same column
 * reads fine from one export and is silently ignored from another.
 */
function normalizeHeader(header: string): string {
	return header
		.toLowerCase()
		.replaceAll(/[([{].*?[)\]}]/g, '')
		.replaceAll(/[^a-z0-9]/g, '');
}

function isBlank(cell: unknown): boolean {
	return cell === null || cell === undefined || String(cell).trim().length === 0;
}

/**
 * A cell as a `YYYY-MM-DD` calendar day, or `null`.
 *
 * `cellDates` makes SheetJS hand back a `Date` for a real date cell, and its
 * parts are read in local time rather than through `toISOString` — a date cell is
 * a calendar day with no zone attached, and rendering it as UTC shifts it a day
 * backwards for anyone west of Greenwich. The same trap the summary read seam has.
 */
function readDate(cell: unknown): string | null {
	if (cell instanceof Date) {
		return Number.isNaN(cell.getTime())
			? null
			: `${cell.getFullYear()}-${pad(cell.getMonth() + 1)}-${pad(cell.getDate())}`;
	}
	const text = String(cell ?? '').trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
		return text;
	}
	// `M/D/YYYY` and `MM/DD/YYYY`, which is what a US export writes when the cell
	// was stored as text rather than as a date.
	const slashed = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
	if (slashed !== null) {
		const [, month, day, year] = slashed as unknown as [string, string, string, string];
		return `${year}-${pad(Number(month))}-${pad(Number(day))}`;
	}
	return null;
}

function pad(value: number): string {
	return String(value).padStart(2, '0');
}

/**
 * A reading, `null` for an empty cell, or `undefined` for one that is not a
 * number at all.
 *
 * Three outcomes rather than two, and `undefined` rather than `NaN` for the bad
 * one: `NaN === NaN` is false, so a sentinel compared by `===` can never match
 * and every unreadable cell would pass through as a reading.
 */
function readNumber(cell: unknown): number | null | undefined {
	if (isBlank(cell)) {
		return null;
	}
	const value = typeof cell === 'number' ? cell : Number(String(cell).trim());
	return Number.isFinite(value) ? round2(value) : undefined;
}

/**
 * Two decimal places, which the domain requires and refuses rather than rounds.
 *
 * Rounded here rather than sent through, because a spreadsheet routinely carries
 * more precision than it means — a cell showing 1.25 can hold 1.2500000000000002
 * after a formula — and failing a whole file over float noise would be reporting a
 * problem the user cannot see in their own document. The domain's refusal stands
 * for the values a *person* typed, which is the manual entry form's path.
 */
function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

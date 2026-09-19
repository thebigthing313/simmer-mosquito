/**
 * A spreadsheet of weather readings, turned into SIMMER-shaped summary rows.
 * Parsing, column mapping and unit conversion are client work
 * (`docs/weather-domain.md`), so what crosses the wire is normalized rows.
 *
 * SheetJS reads `.csv`, `.xls` and `.xlsx` through one call and is loaded with
 * a dynamic `import()` so it stays out of the boot bundle. It comes from
 * SheetJS's own registry rather than npm: the npm `xlsx` package stopped at
 * 0.18.5 and carries an unfixed prototype-pollution advisory (CVE-2023-30533)
 * on reading an untrusted file, so the pinned tarball in `apps/web/package.json`
 * is the maintained build.
 *
 * Header names are matched case- and punctuation-insensitively against a list
 * of spellings per field; nothing is guessed positionally. Values are taken as
 * already canonical (Fahrenheit, inches, percent, miles per hour). A file in
 * Celsius or millimetres is out of scope for v1.
 */

/** The header spellings that map to each canonical field. */
const COLUMN_ALIASES: Readonly<Record<string, readonly string[]>> = {
	startDate: ['startdate', 'start', 'date', 'begindate', 'from', 'observationdate', 'day'],
	endDate: ['enddate', 'end', 'through', 'to', 'todate'],
	temperatureMinF: [
		'temperatureminf',
		'mintemp',
		'tempmin',
		'tmin',
		'mintemperature',
		'lowf',
		'low',
	],
	temperatureMaxF: [
		'temperaturemaxf',
		'maxtemp',
		'tempmax',
		'tmax',
		'maxtemperature',
		'highf',
		'high',
	],
	precipitationInches: ['precipitationinches', 'precipitation', 'precip', 'rain', 'rainfall'],
	relativeHumidityMin: ['relativehumiditymin', 'humiditymin', 'minhumidity', 'rhmin', 'minrh'],
	relativeHumidityMax: ['relativehumiditymax', 'humiditymax', 'maxhumidity', 'rhmax', 'maxrh'],
	windSpeedMinMph: ['windspeedminmph', 'windmin', 'minwind', 'windspeedmin', 'minwindspeed'],
	windSpeedMaxMph: [
		'windspeedmaxmph',
		'windmax',
		'maxwind',
		'windspeedmax',
		'gust',
		'maxwindspeed',
	],
};

/**
 * What to call each column, for somebody looking at a spreadsheet. Read by the
 * upload screen, which names the columns before a file is chosen, and by
 * {@link metricLabel}, which names one in a refusal.
 */
const COLUMN_LABELS: Readonly<Record<string, string>> = {
	startDate: 'Date',
	endDate: 'End date',
	temperatureMinF: 'Minimum temperature',
	temperatureMaxF: 'Maximum temperature',
	precipitationInches: 'Precipitation',
	relativeHumidityMin: 'Minimum humidity',
	relativeHumidityMax: 'Maximum humidity',
	windSpeedMinMph: 'Minimum wind speed',
	windSpeedMaxMph: 'Maximum wind speed',
};

/** The same name, mid-sentence: "The precipitation is not a number." */
function metricLabel(field: string): string {
	const label = COLUMN_LABELS[field];
	return label === undefined ? field : `The ${label.toLowerCase()}`;
}

const METRIC_FIELDS = [
	'temperatureMinF',
	'temperatureMaxF',
	'precipitationInches',
	'relativeHumidityMin',
	'relativeHumidityMax',
	'windSpeedMinMph',
	'windSpeedMaxMph',
] as const;

/** A column the parser can map, and every heading it answers to. */
export interface ImportColumn {
	readonly label: string;
	/**
	 * The spellings, normalized the way {@link normalizeHeader} normalizes a
	 * header: lower case, no punctuation, no bracketed unit.
	 */
	readonly headings: readonly string[];
}

/**
 * The columns the upload screen names, derived from the map the parser
 * matches with. Only the date is required.
 */
export const IMPORT_COLUMNS: {
	readonly required: readonly ImportColumn[];
	readonly recommended: readonly ImportColumn[];
} = {
	required: describeColumns(['startDate']),
	recommended: describeColumns(['endDate', ...METRIC_FIELDS]),
};

function describeColumns(fields: readonly string[]): readonly ImportColumn[] {
	return fields.map((field) => ({
		label: COLUMN_LABELS[field] ?? field,
		headings: COLUMN_ALIASES[field] ?? [],
	}));
}

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
 * Read a spreadsheet into summary rows. Never throws for a bad file: an
 * unreadable one comes back as `error`, and a bad line comes back in
 * `rejected`.
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
		// `header: 1` gives rows as arrays, so two columns with the same header do
		// not collapse into one. `blankrows` stays at its default so line numbers
		// match the user's file; the loop below skips blank rows itself.
		table = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
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
			// A blank line is not a deletion request, and not a failure either, a
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
 * Turn one line into a row, or say what is wrong with it. Every refusal names
 * the line, so someone can open their own file at it.
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
		return { line, reason: `${metricLabel(metrics)} is not a number.` };
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
 * unit a column names itself with. The bracketed unit goes before the
 * punctuation does, or "Precip (in)" collapses to `precipin`.
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
 * A cell as a `YYYY-MM-DD` calendar day, or `null`. A date cell's parts are
 * read in local time rather than through `toISOString`, which shifts it a day
 * backwards west of Greenwich.
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
 * number at all. `undefined` rather than `NaN`, because `NaN === NaN` is false.
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
 * Rounded here because a spreadsheet cell showing 1.25 can hold
 * 1.2500000000000002 after a formula. The manual entry form does not round.
 */
function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

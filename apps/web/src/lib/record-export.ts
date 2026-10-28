/**
 * The file an export writes, built in the browser from the rows the `/export`
 * read answers.
 *
 * SheetJS writes both formats and is the dependency the weather import already
 * reads spreadsheets with. It is loaded here with a dynamic `import()`, so its
 * chunk is fetched the first time someone exports and stays out of the boot
 * bundle.
 */

/** The two files an export can be. */
export type RecordExportFormat = 'csv' | 'xlsx';

/** The headers and rows an export read answers, values in column order. */
export interface RecordExportTable {
	readonly headers: readonly string[];
	readonly rows: readonly (readonly unknown[])[];
}

const MIME_TYPES: Readonly<Record<RecordExportFormat, string>> = {
	csv: 'text/csv;charset=utf-8',
	xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

/**
 * The export as a file of `format`, one sheet named `sheetName`.
 *
 * The CSV opens with a byte order mark, which is what tells Excel the file is
 * UTF-8 rather than the machine's code page, so a name with an accent survives
 * a double-click.
 */
export async function writeRecordExport(
	format: RecordExportFormat,
	sheetName: string,
	table: RecordExportTable,
): Promise<Blob> {
	const XLSX = await import('xlsx');
	const sheet = XLSX.utils.aoa_to_sheet([
		[...table.headers],
		...table.rows.map((row) => row.map((value) => value ?? null)),
	]);
	if (format === 'csv') {
		return new Blob([`﻿${XLSX.utils.sheet_to_csv(sheet)}`], { type: MIME_TYPES.csv });
	}
	const workbook = XLSX.utils.book_new();
	// A sheet name is at most 31 characters in the format.
	XLSX.utils.book_append_sheet(workbook, sheet, sheetName.slice(0, 31));
	const bytes: ArrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
	return new Blob([bytes], { type: MIME_TYPES.xlsx });
}

/** `Inspections 2026-10-28.xlsx`: the records it holds and the Organization's today. */
export function recordExportFileName(
	titleMany: string,
	today: string,
	format: RecordExportFormat,
): string {
	return `${titleMany} ${today}.${format}`;
}

/** Hand `blob` to the browser as a download named `fileName`. */
export function saveRecordExport(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = fileName;
	link.click();
	// Revoked on the next task rather than at once: some browsers start the
	// download after `click` returns, and a revoked URL downloads nothing.
	setTimeout(() => URL.revokeObjectURL(url), 0);
}

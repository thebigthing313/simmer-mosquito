import { sessionFetch } from '@simmer-mosquito/sync';
import { useState } from 'react';
import { toast } from 'sonner';
import { getServerUrl } from '../../auth';
import { formatCount } from '../../lib/format-count';
import {
	type RecordExportFormat,
	type RecordExportTable,
	recordExportFileName,
	saveRecordExport,
	writeRecordExport,
} from '../../lib/record-export';
import { type RecordType, recordCount, recordNoun } from '../../lib/record-nouns';

/**
 * What an export reads: the set's list endpoint and the params its surface
 * sends for a page, which on the Map carry the viewport and on the Table the
 * whole world's box.
 */
export interface RecordSetExportRequest {
	/** The list endpoint, e.g. `/map/inspections`. The export is `{path}/export`. */
	readonly path: `/map/${string}`;
	/** The page request's params, without the paging. */
	readonly params: Readonly<Record<string, string>>;
	readonly recordType: RecordType;
	/** The Organization's today, which names the file. */
	readonly today: string;
}

export interface RecordSetExport {
	/** Read every match and save it as a file of `format`. */
	readonly exportAs: (format: RecordExportFormat) => void;
	/** An export is being read or written, and another would race it. */
	readonly isExporting: boolean;
}

/**
 * Read `{path}/export` under the page's params and save what it answers as a
 * CSV or XLSX file.
 *
 * Takes the request, or null while there is nothing to read yet, before the
 * Map has a viewport. A refusal over the ceiling and a failed read each raise a
 * toast and save nothing, so no partial file is ever written.
 */
export function useRecordSetExport(request: RecordSetExportRequest | null): RecordSetExport {
	const [isExporting, setExporting] = useState(false);

	const exportAs = (format: RecordExportFormat) => {
		if (request === null || isExporting) {
			return;
		}
		setExporting(true);
		void runExport(request, format).finally(() => setExporting(false));
	};

	return { exportAs, isExporting };
}

async function runExport(request: RecordSetExportRequest, format: RecordExportFormat) {
	const noun = recordNoun(request.recordType);
	try {
		const url = new URL(`${request.path}/export`, getServerUrl());
		for (const [key, value] of Object.entries(request.params)) {
			url.searchParams.set(key, value);
		}
		const response = await sessionFetch(url);
		const body: unknown = await response.json();
		if (!response.ok) {
			// A refusal over the ceiling says how many matched and what to do,
			// which is the toast. Anything else falls through to the general one.
			const refusal = response.status === 422 ? ceilingRefusal(body) : null;
			if (refusal !== null) {
				toast.error(`${noun.titleMany} not exported`, {
					description: `${recordCount(request.recordType, refusal.total)} match. Narrow the filters to ${formatCount(refusal.ceiling)} or fewer to export them.`,
				});
				return;
			}
			throw new Error(`Export failed (${response.status}).`);
		}
		// A body without both arrays is not an export, and saving it would write
		// an empty or headless file under a name that says it is complete.
		if (!isExportTable(body)) {
			throw new Error('Export answered without headers and rows.');
		}
		const blob = await writeRecordExport(format, noun.titleMany, body);
		saveRecordExport(blob, recordExportFileName(noun.titleMany, request.today, format));
	} catch {
		toast.error(`${noun.titleMany} not exported`, {
			description: 'The export could not be read. Try again.',
		});
	}
}

function isExportTable(body: unknown): body is RecordExportTable {
	if (typeof body !== 'object' || body === null) {
		return false;
	}
	const { headers, rows } = body as Record<string, unknown>;
	return Array.isArray(headers) && Array.isArray(rows) && rows.every(Array.isArray);
}

function ceilingRefusal(
	body: unknown,
): { readonly total: number; readonly ceiling: number } | null {
	if (typeof body !== 'object' || body === null) {
		return null;
	}
	const { total, ceiling } = body as Record<string, unknown>;
	return typeof total === 'number' && typeof ceiling === 'number' ? { total, ceiling } : null;
}

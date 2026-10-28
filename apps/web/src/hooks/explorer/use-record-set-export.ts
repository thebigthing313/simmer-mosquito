import { sessionFetch } from '@simmer-mosquito/sync';
import { useState } from 'react';
import { toast } from 'sonner';
import { getServerUrl } from '../../auth';
import {
	type RecordExportFormat,
	type RecordExportTable,
	recordExportFileName,
	saveRecordExport,
	writeRecordExport,
} from '../../lib/record-export';
import { type RecordType, recordNoun } from '../../lib/record-nouns';

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
		const body = (await response.json()) as Partial<RecordExportTable> & {
			readonly reason?: unknown;
		};
		if (!response.ok) {
			// A refusal over the ceiling says how many matched and what to do,
			// which is the toast. Anything else falls through to the general one.
			if (response.status === 422 && typeof body.reason === 'string') {
				toast.error(`${noun.titleMany} not exported`, { description: body.reason });
				return;
			}
			throw new Error(`Export failed (${response.status}).`);
		}
		const blob = await writeRecordExport(format, noun.titleMany, {
			headers: body.headers ?? [],
			rows: body.rows ?? [],
		});
		saveRecordExport(blob, recordExportFileName(noun.titleMany, request.today, format));
	} catch {
		toast.error(`${noun.titleMany} not exported`, {
			description: 'The export could not be read. Try again.',
		});
	}
}

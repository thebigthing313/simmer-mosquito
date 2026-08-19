/**
 * Sending a parsed spreadsheet to the one weather endpoint that is not a
 * collection write.
 *
 * Every other weather write goes through `mutateCollection`, which turns one row
 * into one command and waits for the txid that confirms it synced. This one
 * cannot: it is up to 5,000 rows against one station, and its answer is a
 * per-row verdict rather than a row. There is no optimistic state to apply
 * either, which rows insert, which update and which fail is the server's
 * decision, taken against the station's stored buckets, so guessing it locally
 * would put rows on screen that the commit is about to reject.
 *
 * The rows arrive through the ordinary Electric stream once the transaction
 * commits, the same way they would after any other write.
 */

import { getServerUrl } from '../../../auth';
import { commandErrorFrom, readResponseBody } from '../../../sync/command-error';

/** One submitted line's verdict, correlated back by the id the client gave it. */
export interface WeatherImportRowResult {
	/** The spreadsheet line number, as a string, see the import page. */
	readonly clientRowId: string;
	readonly status: 'inserted' | 'updated' | 'noChange' | 'failed';
	readonly weatherSummaryId: string | null;
	readonly issues: readonly { readonly path: string; readonly message: string }[];
}

export interface WeatherImportResult {
	readonly rows: readonly WeatherImportRowResult[];
	readonly counts: {
		readonly inserted: number;
		readonly updated: number;
		readonly noChange: number;
		readonly failed: number;
	};
}

export interface WeatherImportRow {
	readonly clientRowId: string;
	readonly weatherSummaryId: string;
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

/**
 * Commit an import, or throw the refusal it was answered with.
 *
 * A refusal comes back as `CommandError` with the server's body attached, which
 * is what lets `useAcknowledgedWrite` recognise the two acknowledgeable ones and
 * offer the retry. Reducing it to a message here would leave the caller with a
 * sentence and no way to act on it.
 */
export async function commitWeatherImport(input: {
	readonly weatherStationId: string;
	readonly rows: readonly WeatherImportRow[];
	readonly acknowledgedUpdates: boolean;
	readonly acknowledgedPartialImport: boolean;
}): Promise<WeatherImportResult> {
	const response = await fetch(`${getServerUrl()}/commands/weather_summaries/import`, {
		method: 'POST',
		credentials: 'include',
		headers: { accept: 'application/json', 'content-type': 'application/json' },
		body: JSON.stringify({
			// The column name, as everywhere else on the `/commands` surface.
			weather_source_id: input.weatherStationId,
			rows: input.rows,
			acknowledgedUpdates: input.acknowledgedUpdates,
			acknowledgedPartialImport: input.acknowledgedPartialImport,
		}),
	});

	const body = await readResponseBody(response);
	if (!response.ok) {
		throw commandErrorFrom(response, body, 'Unable to import these readings.');
	}
	return body as unknown as WeatherImportResult;
}

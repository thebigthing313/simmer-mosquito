/**
 * Sending a parsed spreadsheet to the one weather endpoint that is not a
 * collection write. It is up to 5,000 rows against one station, its answer is
 * a per-row verdict, and there is no optimistic state: which rows insert,
 * update or fail is the server's decision. The rows arrive through the
 * ordinary Electric stream once the transaction commits.
 */

import { sessionFetch } from '@simmer-mosquito/sync';
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
 * Commit an import, or throw the refusal it was answered with. A refusal is a
 * `CommandError` with the server's body attached, which is what lets
 * `useAcknowledgedWrite` recognise the acknowledgeable ones and offer the
 * retry.
 */
export async function commitWeatherImport(input: {
	readonly weatherStationId: string;
	readonly rows: readonly WeatherImportRow[];
	readonly acknowledgedUpdates: boolean;
	readonly acknowledgedPartialImport: boolean;
}): Promise<WeatherImportResult> {
	const response = await sessionFetch(`${getServerUrl()}/commands/weather_summaries/import`, {
		method: 'POST',
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

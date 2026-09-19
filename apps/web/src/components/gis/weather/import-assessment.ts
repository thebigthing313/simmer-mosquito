/**
 * What a file would do to a station, worked out before anything is written:
 * steps 5 and 6 of the upload flow in `docs/weather-domain.md`. The summaries
 * this reads are whatever the client has synced, so the server re-assesses
 * inside the write transaction and its verdict is what writes; this is the
 * estimate the user reviews. Only attemptable rows are submitted. The
 * assessment is `assessWeatherSummaryImportRows` from the domain, the same
 * function the server runs.
 */

import {
	assessWeatherSummaryImportRows,
	type WeatherImportAssessmentAction,
} from '@simmer-mosquito/domain';
import type { WeatherSummaryListing } from '../../../hooks/queries/weather-summary-view';
import type { WeatherImportRow } from './import-commit';
import type { ParsedSummaryRow } from './import-parse';

/** One parsed line, with what it would do and why. */
export interface AssessedRow {
	readonly row: WeatherImportRow;
	/** The spreadsheet line, for pointing at the file. */
	readonly line: number;
	readonly action: WeatherImportAssessmentAction;
	readonly issues: readonly { readonly path: string; readonly message: string }[];
}

export interface FileAssessment {
	readonly rows: readonly AssessedRow[];
	readonly counts: Readonly<Record<WeatherImportAssessmentAction, number>>;
	/** The rows worth sending: everything the assessment did not fail. */
	readonly attemptable: readonly WeatherImportRow[];
	/** True when at least one row would overwrite a reading the station holds. */
	readonly hasUpdates: boolean;
	/** True when at least one row cannot be written as it stands. */
	readonly hasFailures: boolean;
}

/**
 * Assess parsed lines against the readings a station already holds. `newId`
 * mints the client-generated id each insert carries, passed in so a test can
 * make the output predictable.
 */
export function assessParsedRows(
	parsed: readonly ParsedSummaryRow[],
	existing: readonly WeatherSummaryListing[],
	newId: () => string,
	/**
	 * The organization's calendar day, so the review fails a future-dated row the
	 * way the server will.
	 */
	currentLocalDate: string,
): FileAssessment {
	const rows: WeatherImportRow[] = parsed.map((row) => ({
		// The spreadsheet line, which is what correlates the server's per-row answer
		// back to something the user can find in their own file.
		clientRowId: String(row.line),
		weatherSummaryId: newId(),
		startDate: row.startDate,
		endDate: row.endDate,
		temperatureMinF: row.temperatureMinF,
		temperatureMaxF: row.temperatureMaxF,
		precipitationInches: row.precipitationInches,
		relativeHumidityMin: row.relativeHumidityMin,
		relativeHumidityMax: row.relativeHumidityMax,
		windSpeedMinMph: row.windSpeedMinMph,
		windSpeedMaxMph: row.windSpeedMaxMph,
	}));

	const assessment = assessWeatherSummaryImportRows({
		rows,
		currentLocalDate,
		existingSummaries: existing.map((summary) => ({
			weatherSummaryId: summary.id,
			startDate: summary.startDate,
			endDate: summary.endDate,
			temperatureMinF: summary.temperatureMinF,
			temperatureMaxF: summary.temperatureMaxF,
			precipitationInches: summary.precipitationInches,
			relativeHumidityMin: summary.relativeHumidityMin,
			relativeHumidityMax: summary.relativeHumidityMax,
			windSpeedMinMph: summary.windSpeedMinMph,
			windSpeedMaxMph: summary.windSpeedMaxMph,
		})),
	});

	const byClientRowId = new Map(rows.map((row) => [row.clientRowId, row] as const));
	const assessed: AssessedRow[] = assessment.rows.flatMap((verdict) => {
		const row = byClientRowId.get(verdict.clientRowId);
		return row === undefined
			? []
			: [
					{
						row,
						line: Number(verdict.clientRowId),
						action: verdict.action,
						issues: verdict.issues,
					},
				];
	});

	return {
		rows: assessed,
		counts: assessment.counts,
		attemptable: assessed.filter((row) => row.action !== 'fail').map((row) => row.row),
		hasUpdates: assessment.counts.update > 0,
		hasFailures: assessment.counts.fail > 0,
	};
}

/** What each verdict is called on screen. */
export function actionLabel(action: WeatherImportAssessmentAction): string {
	switch (action) {
		case 'insert':
			return 'Add';
		case 'update':
			return 'Overwrite';
		case 'noChange':
			return 'No change';
		default:
			return 'Cannot write';
	}
}

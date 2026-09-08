/**
 * What a file would do to a station, worked out before anything is written.
 *
 * `docs/weather-domain.md` puts this on the client deliberately, as steps 5 and 6
 * of the upload flow: "Web assesses rows against loaded existing station
 * summaries" and "User reviews insert/update/no-change/fail counts and row
 * details". The user then "commits selected attemptable rows", which is step 7.
 *
 * ## Why the server's answer is still the one that counts
 *
 * The summaries this reads are whatever the client has synced, and they can be
 * stale by the time the button is pressed. So the server re-assesses inside the
 * write transaction against the rows actually stored, and its verdict is what
 * writes. This one is an estimate the user acts on, which is exactly what a
 * review screen is for: it turns "412 readable" into "3 of these overwrite
 * readings you already have, and 2 cannot be written", before the decision.
 *
 * ## And why it is not just a nicety
 *
 * Only attemptable rows are submitted. A row this pass fails never reaches the
 * command, which matters because the batch is one request: the server assesses
 * the rows it is given, and a file whose own lines collide is better resolved
 * here, against a screen, than reported back afterwards.
 *
 * The assessment itself is `assessWeatherSummaryImportRows` from the domain, the
 * same function the server runs. Re-implementing the rules here would be a second
 * copy of insert/update/no-change/fail to drift from the one that writes.
 */

import {
	assessWeatherSummaryImportRows,
	type WeatherImportAssessmentAction,
} from '@simmer-mosquito/domain';
import type { WeatherSummaryListing } from '../../../hooks/queries/use-weather-summaries';
import type { WeatherImportRow } from './-import-commit';
import type { ParsedSummaryRow } from './-import-parse';

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
 * Assess parsed lines against the readings a station already holds.
 *
 * `newId` mints the client-generated id each insert carries. Passed in rather
 * than called here so a test can make the output predictable, and so the ids are
 * minted once per assessment rather than once per render.
 */
export function assessParsedRows(
	parsed: readonly ParsedSummaryRow[],
	existing: readonly WeatherSummaryListing[],
	newId: () => string,
	/**
	 * The organization's calendar day. Passed so the review fails a future-dated
	 * row the way the server will: without it the screen says "Add" for a line
	 * the commit is about to refuse, which is the one thing a review must not do.
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

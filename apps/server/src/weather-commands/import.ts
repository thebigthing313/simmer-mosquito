/**
 * `weather.commitWeatherSummaryImport`, and the one route that carries it.
 *
 * An agency reads its weather off a spreadsheet: a gauge log, a station export,
 * a county feed someone downloaded. Parsing that file, mapping its columns, and
 * converting its units are web-client work, `docs/weather-domain.md` puts them
 * there deliberately, so that the server never sees a CSV, and what arrives here
 * is up to 5,000 already-normalized SIMMER rows for one station.
 *
 * ## Why this is not a table command
 *
 * Every other write on the `/commands/{table}` surface is one row, named by its
 * id, answering with that row. This one is scoped to a station, writes many rows
 * at once, and its answer is a per-row verdict: which inserted, which updated,
 * which were already right, and which could not be written and why. A dispatch
 * built around `{ row, txid }` has nowhere to put that, so the route is its own.
 *
 * ## The client's assessment is never trusted
 *
 * The web app assesses rows before showing the user a preview, using the
 * summaries it has synced. That preview is what the acknowledgements are agreed
 * against, and it can be stale by the time the user presses the button. So the
 * server runs `assessWeatherSummaryImportRows` again, against the station's rows
 * read inside the write transaction, and its verdict is the one that writes. The
 * request carries no row statuses at all; there is nothing for a client to
 * misreport.
 *
 * ## Consent is checked before anything is written
 *
 * Two gates, both all-or-nothing:
 *
 * - if any row would overwrite an existing bucket and `acknowledgedUpdates` is
 *   absent, nothing is written;
 * - if any row fails and `acknowledgedPartialImport` is absent, nothing is
 *   written.
 *
 * Both are refused before the first insert rather than rolled back after, which
 * matters for the answer as much as the rows: a user who did not agree to
 * overwrite anything gets told what the file would have overwritten, not that
 * their import half-succeeded.
 */

import { sql } from '@simmer-mosquito/db';
import {
	assessWeatherSummaryImportRows,
	type CommitWeatherSummaryImportCommand,
	commitWeatherSummaryImportCommand,
	DomainValidationError,
	type NormalizedWeatherSummaryImportRow,
	type WeatherImportCommitStatus,
	type WeatherSummaryImportRowAssessment,
	type WeatherSummaryImportRowInput,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { agencyCommandContext, handleCommandError, readJsonObject } from '../command-endpoint.js';
import { readString } from '../command-payload.js';
import { denyUnauthorizedAgencyCommands } from '../command-permissions.js';
import { commandActor, writeCommands } from '../command-write.js';
import { refusableWrite } from '../table-commands/shared.js';
import {
	CommandError,
	loadStation,
	loadStationSummaries,
	localDateColumn,
	type RouteOptions,
	type WeatherTransaction,
} from './shared.js';

/**
 * The 409 a raced bucket becomes.
 *
 * The assessment already refused every clash it could see, so reaching this means
 * another writer took the bucket between the read and the write. Same answer the
 * manual path gives, rather than a 500 that rolls the batch back with nothing to
 * say.
 */
const DUPLICATE_BUCKET = {
	error: 'weather_summary_duplicate',
	reason: 'Another write took one of these date buckets while this import was running.',
};

/** What one submitted row became, correlated back by the id the client gave it. */
export interface WeatherImportRowResult {
	readonly clientRowId: string;
	readonly status: WeatherImportCommitStatus;
	/** The row that now holds this bucket, or `null` for a row that failed. */
	readonly weatherSummaryId: string | null;
	readonly issues: readonly { readonly path: string; readonly message: string }[];
}

export interface WeatherImportResult {
	readonly rows: readonly WeatherImportRowResult[];
	readonly counts: Readonly<Record<WeatherImportCommitStatus, number>>;
}

/**
 * `POST /commands/weather_summaries/import`.
 *
 * Under the `/commands` prefix rather than a `/weather/*` path of its own,
 * because it is the same surface doing the same job for the same collection,
 * a client that writes one summary and a client that imports a thousand are the
 * same client, and splitting the two across two prefixes would make that look
 * like a difference in kind. Registered here rather than through
 * `registerTableCommandRoutes` only because its shape does not fit that
 * dispatch, which is a fact about the response body, not about where it belongs.
 */
export function registerWeatherImportRoute(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/commands/weather_summaries/import', options.authContextMiddleware, async (context) => {
		// Written out rather than assembled by `commandEndpoint`, for the ordering:
		// that helper runs `build` before `run`, and the role check has to come
		// first. The command's name is fixed for this route and is enough to decide
		// authorization, so a collector should be refused before the domain is asked
		// to parse and validate five thousand rows. `dispatch.ts` makes the same
		// argument for the same reason.
		const denial = denyUnauthorizedAgencyCommands(context, [
			{ type: 'weather.commitWeatherSummaryImport' },
		]);
		if (denial !== null) {
			return denial;
		}

		const parsed = await readJsonObject(context.req);
		if (!parsed.ok) {
			return context.json({ error: 'invalid_payload', reason: parsed.reason }, 400);
		}
		const payload = parsed.payload;

		const authContext = context.get('authContext');
		let command: CommitWeatherSummaryImportCommand;
		try {
			command = commitWeatherSummaryImportCommand({
				...agencyCommandContext(authContext),
				weatherStationId: readString(payload.weather_source_id),
				rows: readRows(payload.rows),
				acknowledgedUpdates: payload.acknowledgedUpdates === true,
				acknowledgedPartialImport: payload.acknowledgedPartialImport === true,
			});
		} catch (error) {
			if (!(error instanceof DomainValidationError)) {
				throw error;
			}
			return context.json(
				{ error: 'invalid_command', message: error.message, issues: error.issues },
				400,
			);
		}

		try {
			// The agency's calendar day, resolved once here because the writer is
			// handed a transaction and a command and has no way to reach a setting.
			// Without it the bulk path would accept next month's forecast while the
			// two manual paths refuse it.
			const currentLocalDate = todayInTimeZone(authContext.timeZone);
			// `writeCommands` rather than a bare transaction, so the ownership
			// resolver runs here as it does on every other write.
			const written = await writeCommands(
				options.db,
				commandActor(authContext),
				[command],
				(trx, one) => commitWeatherSummaryImport(trx, one, currentLocalDate),
			);
			if (written.row === null) {
				return context.json({ error: 'weather_station_not_found' }, 404);
			}
			return context.json({ ...written.row, txid: written.txid }, 200);
		} catch (error) {
			return handleCommandError(context, error);
		}
	});
}

/** Today, as the calendar day the agency is currently on. */
function todayInTimeZone(timeZone: string): string {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).format(new Date());
}

/**
 * The import, as a writer.
 *
 * Exported so the Postgres integration tests can drive it directly, the way the
 * per-table writers are driven. The route above is the only caller in the app.
 */
export async function commitWeatherSummaryImport(
	trx: WeatherTransaction,
	command: CommitWeatherSummaryImportCommand,
	/** The agency's calendar day, so a row dated after it fails rather than writes. */
	currentLocalDate: string,
): Promise<WeatherImportResult | null> {
	const station = await loadStation(
		trx,
		command.payload.weatherStationId,
		command.payload.organizationId,
	);
	if (station === undefined) {
		return null;
	}
	// Unlike a manual create, an import into an inactive station is allowed:
	// backfilling a gauge log for a station an agency has stopped reading is the
	// ordinary reason to have a spreadsheet at all.

	const assessment = assessWeatherSummaryImportRows({
		rows: command.payload.rows,
		currentLocalDate,
		existingSummaries: (await loadStationSummaries(trx, station.id)).map((stored) => ({
			weatherSummaryId: stored.weatherSummaryId,
			startDate: stored.startDate,
			endDate: stored.endDate,
			temperatureMinF: stored.temperatureMinF,
			temperatureMaxF: stored.temperatureMaxF,
			precipitationInches: stored.precipitationInches,
			relativeHumidityMin: stored.relativeHumidityMin,
			relativeHumidityMax: stored.relativeHumidityMax,
			windSpeedMinMph: stored.windSpeedMinMph,
			windSpeedMaxMph: stored.windSpeedMaxMph,
		})),
	});

	if (assessment.counts.update > 0 && !command.payload.acknowledgedUpdates) {
		throw new CommandError(409, {
			error: 'weather_import_updates_unacknowledged',
			reason: `${assessment.counts.update} of these rows would overwrite a summary this station already holds.`,
		});
	}
	if (assessment.counts.fail > 0 && !command.payload.acknowledgedPartialImport) {
		throw new CommandError(409, {
			error: 'weather_import_partial_unacknowledged',
			reason: `${assessment.counts.fail} of these rows cannot be written.`,
		});
	}

	const rowsByClientId = new Map(
		command.payload.rows.map((row) => [row.clientRowId, row] as const),
	);
	const results: WeatherImportRowResult[] = [];

	for (const assessed of assessment.rows) {
		results.push(
			await writeAssessedRow(trx, {
				assessed,
				submitted: rowsByClientId.get(assessed.clientRowId),
				stationId: station.id,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			}),
		);
	}

	return {
		rows: results,
		counts: {
			inserted: results.filter((row) => row.status === 'inserted').length,
			updated: results.filter((row) => row.status === 'updated').length,
			noChange: results.filter((row) => row.status === 'noChange').length,
			failed: results.filter((row) => row.status === 'failed').length,
		},
	};
}

/**
 * One assessed row, written or reported.
 *
 * Its own function because the four verdicts are four different writes and the
 * loop above should read as "each row, in order, becomes a result". Nothing here
 * is scoped again: the station was resolved against the agency before the
 * assessment ran, and an `update` names a row read from that station inside this
 * transaction.
 */
async function writeAssessedRow(
	trx: WeatherTransaction,
	input: {
		readonly assessed: WeatherSummaryImportRowAssessment;
		readonly submitted: NormalizedWeatherSummaryImportRow | undefined;
		readonly stationId: string;
		readonly organizationId: string;
		readonly actorProfileId: string;
	},
): Promise<WeatherImportRowResult> {
	const { assessed, submitted } = input;

	if (assessed.action === 'fail' || submitted === undefined) {
		return {
			clientRowId: assessed.clientRowId,
			status: 'failed',
			weatherSummaryId: null,
			issues: assessed.issues,
		};
	}

	if (assessed.action === 'noChange') {
		// A no-op on purpose: the stored row already says this, so touching it would
		// move `updated_at` and claim an edit that did not happen.
		return {
			clientRowId: assessed.clientRowId,
			status: 'noChange',
			weatherSummaryId: assessed.weatherSummaryId,
			issues: [],
		};
	}

	if (assessed.action === 'update') {
		// An `update` verdict always names the row it found, but the type allows
		// null. Reporting a row as updated when the `where` matched nothing is the
		// silent wrong answer, so it fails instead.
		const storedId = assessed.weatherSummaryId;
		if (storedId === null) {
			return {
				clientRowId: assessed.clientRowId,
				status: 'failed',
				weatherSummaryId: null,
				issues: [{ path: 'weatherSummaryId', message: 'This bucket could not be resolved.' }],
			};
		}
		// Full-row replacement, not a patch: an import row is the whole reading for
		// that bucket, so a metric the spreadsheet does not carry clears the stored
		// one rather than surviving under it.
		await refusableWrite(
			() =>
				trx
					.updateTable('weather_summaries')
					.set({
						...metricColumns(submitted),
						updated_by_profile_id: input.actorProfileId,
						updated_at: sql`now()`,
					})
					.where('id', '=', storedId)
					.execute(),
			{ duplicate: DUPLICATE_BUCKET },
		);
		return {
			clientRowId: assessed.clientRowId,
			status: 'updated',
			weatherSummaryId: storedId,
			issues: [],
		};
	}

	await refusableWrite(
		() =>
			trx
				.insertInto('weather_summaries')
				.values({
					id: submitted.weatherSummaryId,
					organization_id: input.organizationId,
					weather_source_id: input.stationId,
					start_date: localDateColumn(submitted.startDate),
					end_date: localDateColumn(submitted.endDate),
					...metricColumns(submitted),
					created_by_profile_id: input.actorProfileId,
					updated_by_profile_id: input.actorProfileId,
				})
				.execute(),
		{ duplicate: DUPLICATE_BUCKET },
	);
	return {
		clientRowId: assessed.clientRowId,
		status: 'inserted',
		weatherSummaryId: submitted.weatherSummaryId,
		issues: [],
	};
}

/** The seven readings, as columns. Written once so insert and update agree. */
function metricColumns(row: NormalizedWeatherSummaryImportRow) {
	return {
		temperature_min_f: row.temperatureMinF,
		temperature_max_f: row.temperatureMaxF,
		precipitation_inches: row.precipitationInches,
		relative_humidity_min: row.relativeHumidityMin,
		relative_humidity_max: row.relativeHumidityMax,
		wind_speed_min_mph: row.windSpeedMinMph,
		wind_speed_max_mph: row.windSpeedMaxMph,
	};
}

/**
 * The submitted rows, unvalidated.
 *
 * Every field is passed through as it arrived. The domain builder is what
 * rejects a row that is not an object, is missing a date, carries a metric out of
 * bounds, or repeats a bucket, and it reports those against `rows.3.startDate`
 * paths the client can map back to a spreadsheet line. Narrowing here would be a
 * second copy of those rules, and the copy that goes stale.
 */
function readRows(value: unknown): readonly WeatherSummaryImportRowInput[] {
	return Array.isArray(value) ? (value as readonly WeatherSummaryImportRowInput[]) : [];
}

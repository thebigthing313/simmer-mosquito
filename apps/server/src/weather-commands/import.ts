/**
 * `weather.commitWeatherSummaryImport`, and the one route that carries it.
 *
 * An agency reads its weather off a spreadsheet: a gauge log, a station export,
 * a county feed someone downloaded. Parsing that file, mapping its columns, and
 * converting its units are web-client work — `docs/weather-domain.md` puts them
 * there deliberately, so that the server never sees a CSV — and what arrives here
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

import {
	assessWeatherSummaryImportRows,
	type CommitWeatherSummaryImportCommand,
	commitWeatherSummaryImportCommand,
	type WeatherImportCommitStatus,
	type WeatherSummaryImportRowInput,
} from '@simmer-mosquito/domain';
import type { Hono } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { handleCommandError } from '../command-endpoint.js';
import { authorizeCommands } from '../command-permissions.js';
import { commandActor, writeCommands } from '../command-write.js';
import {
	CommandError,
	commandEndpoint,
	loadStation,
	loadStationSummaries,
	localDateColumn,
	type RouteOptions,
	type WeatherTransaction,
} from './shared.js';

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
 * because it is the same surface doing the same job for the same collection —
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
	app.post(
		'/commands/weather_summaries/import',
		options.authContextMiddleware,
		commandEndpoint<CommitWeatherSummaryImportCommand>({
			build: ({ payload, agency }) =>
				commitWeatherSummaryImportCommand({
					...agency,
					weatherStationId: readString(payload.weather_source_id),
					rows: readRows(payload.rows),
					acknowledgedUpdates: payload.acknowledgedUpdates === true,
					acknowledgedPartialImport: payload.acknowledgedPartialImport === true,
				}),
			run: async (context, commands) => {
				const authContext = context.get('authContext');
				const denial = authorizeCommands(
					{ role: authContext.role, isOperator: authContext.isOperator },
					commands,
				);
				if (denial !== null) {
					return context.json(denial, 403);
				}

				try {
					// One command, always: the builder returns exactly one, and the
					// endpoint's list is a shape the plumbing wants rather than a batch.
					// `writeCommands` is still what opens the transaction, so the
					// ownership resolver runs here as it does on every other write.
					const written = await writeCommands(
						options.db,
						commandActor(authContext),
						commands,
						commitWeatherSummaryImport,
					);
					if (written.row === null) {
						return context.json({ error: 'weather_station_not_found' }, 404);
					}
					return context.json({ ...written.row, txid: written.txid }, 200);
				} catch (error) {
					return handleCommandError(context, error);
				}
			},
		}),
	);
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
		const submitted = rowsByClientId.get(assessed.clientRowId);
		if (assessed.action === 'fail' || submitted === undefined) {
			results.push({
				clientRowId: assessed.clientRowId,
				status: 'failed',
				weatherSummaryId: null,
				issues: assessed.issues,
			});
			continue;
		}

		if (assessed.action === 'noChange') {
			// A no-op on purpose: the stored row already says this, so touching it
			// would move `updated_at` and claim an edit that did not happen.
			results.push({
				clientRowId: assessed.clientRowId,
				status: 'noChange',
				weatherSummaryId: assessed.weatherSummaryId,
				issues: [],
			});
			continue;
		}

		if (assessed.action === 'update') {
			// Full-row replacement, not a patch: an import row is the whole reading
			// for that bucket, so a metric the spreadsheet does not carry clears the
			// stored one rather than surviving under it.
			await trx
				.updateTable('weather_summaries')
				.set({
					temperature_min_f: submitted.temperatureMinF,
					temperature_max_f: submitted.temperatureMaxF,
					precipitation_inches: submitted.precipitationInches,
					relative_humidity_min: submitted.relativeHumidityMin,
					relative_humidity_max: submitted.relativeHumidityMax,
					wind_speed_min_mph: submitted.windSpeedMinMph,
					wind_speed_max_mph: submitted.windSpeedMaxMph,
					updated_by_profile_id: command.payload.actorProfileId,
					updated_at: new Date(),
				})
				.where('id', '=', assessed.weatherSummaryId as string)
				.execute();
			results.push({
				clientRowId: assessed.clientRowId,
				status: 'updated',
				weatherSummaryId: assessed.weatherSummaryId,
				issues: [],
			});
			continue;
		}

		await trx
			.insertInto('weather_summaries')
			.values({
				id: submitted.weatherSummaryId,
				organization_id: command.payload.organizationId,
				weather_source_id: station.id,
				start_date: localDateColumn(submitted.startDate),
				end_date: localDateColumn(submitted.endDate),
				temperature_min_f: submitted.temperatureMinF,
				temperature_max_f: submitted.temperatureMaxF,
				precipitation_inches: submitted.precipitationInches,
				relative_humidity_min: submitted.relativeHumidityMin,
				relative_humidity_max: submitted.relativeHumidityMax,
				wind_speed_min_mph: submitted.windSpeedMinMph,
				wind_speed_max_mph: submitted.windSpeedMaxMph,
				created_by_profile_id: command.payload.actorProfileId,
				updated_by_profile_id: command.payload.actorProfileId,
			})
			.execute();
		results.push({
			clientRowId: assessed.clientRowId,
			status: 'inserted',
			weatherSummaryId: submitted.weatherSummaryId,
			issues: [],
		});
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

function readString(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/**
 * The submitted rows, unvalidated.
 *
 * Every field is passed through as it arrived. The domain builder is what
 * rejects a row that is not an object, is missing a date, carries a metric out of
 * bounds, or repeats a bucket — and it reports those against `rows.3.startDate`
 * paths the client can map back to a spreadsheet line. Narrowing here would be a
 * second copy of those rules, and the copy that goes stale.
 */
function readRows(value: unknown): readonly WeatherSummaryImportRowInput[] {
	return Array.isArray(value) ? (value as readonly WeatherSummaryImportRowInput[]) : [];
}

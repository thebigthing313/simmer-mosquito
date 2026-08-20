/**
 * The `weather_sources` and `weather_summaries` tables, as commands.
 *
 * Nine of the ten `weather.*` names; the tenth is the spreadsheet import, which
 * is station-scoped rather than row-scoped and answers per-row results, so it
 * has its own route in `weather-commands/import.ts` rather than an intent here.
 *
 * ## Field names
 *
 * Postgres column names, as everywhere on this surface: `source_name`,
 * `source_code`, `weather_source_id`, `start_date`, `temperature_min_f`. The
 * domain calls the first two the station's name and code and the third the
 * station it belongs to, `docs/weather-domain.md` keeps "weather station" as
 * the word for a `weather_sources` row, and the translation between the two
 * vocabularies is exactly what these builders are.
 *
 * `geometry` is the exception, as it is on `regions` and the surveillance
 * tables: the point lives in `geom`, which never syncs, so `geometry` names the
 * shape to store rather than a column.
 *
 * ## The future-date rule needs the agency's zone
 *
 * A summary records weather that has already happened, so its bucket cannot end
 * after today. Which day "today" is depends on the agency's timezone, a
 * California agency entering yesterday's rain at 6pm is on a date UTC has
 * already left, so the check cannot live in a domain builder, which is handed
 * no zone, and cannot live in the writer, which is handed a transaction and a
 * command and nothing else. It lives here, where `authContext.timeZone` is the
 * setting resolved once per request.
 */

import {
	createWeatherStationCommand,
	createWeatherSummaryCommand,
	DomainValidationError,
	deactivateWeatherStationCommand,
	deleteWeatherStationCommand,
	deleteWeatherSummaryCommand,
	reactivateWeatherStationCommand,
	updateWeatherStationDetailsCommand,
	updateWeatherStationLocationCommand,
	updateWeatherSummaryCommand,
	type WeatherCommand,
} from '@simmer-mosquito/domain';
import { readNullableText, readText } from '../command-payload.js';
import type { CommandDb } from '../command-write.js';
import { readDate } from '../command-write.js';
import type { SafeWeatherStation, SafeWeatherSummary } from '../weather-commands/shared.js';
import { writeWeatherStationCommand } from '../weather-commands/stations.js';
import { writeWeatherSummaryCommand } from '../weather-commands/summaries.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

export function weatherStationTableCommands(
	db: CommandDb,
): TableCommands<WeatherCommand, SafeWeatherStation> {
	return {
		table: 'weather_sources',
		run: {
			db,
			write: writeWeatherStationCommand,
			notFound: 'weather_station_not_found',
			key: 'weatherStation',
		},
		intents: {
			'weather.createWeatherStation': ({ payload, agency, id }) =>
				createWeatherStationCommand({
					...agency,
					weatherStationId: id,
					stationName: readText(payload.source_name) ?? '',
					stationCode: readNullableText(payload.source_code),
					metadata: payload.metadata ?? null,
					geometry: payload.geometry,
				}),

			'weather.updateWeatherStationDetails': ({ payload, agency, id }) =>
				updateWeatherStationDetailsCommand({
					...agency,
					weatherStationId: id,
					expectedUpdatedAt: readDate(payload.expectedUpdatedAt),
					...('source_name' in payload ? { stationName: readText(payload.source_name) ?? '' } : {}),
					...('source_code' in payload
						? { stationCode: readNullableText(payload.source_code) }
						: {}),
					...('metadata' in payload ? { metadata: payload.metadata ?? null } : {}),
					acknowledgedHistoricalStationIdentityChange: acknowledged(
						payload.acknowledgedHistoricalStationIdentityChange,
					),
				}),

			'weather.updateWeatherStationLocation': ({ payload, agency, id }) =>
				updateWeatherStationLocationCommand({
					...agency,
					weatherStationId: id,
					expectedUpdatedAt: readDate(payload.expectedUpdatedAt),
					geometry: payload.geometry,
					acknowledgedHistoricalLocationChange: acknowledged(
						payload.acknowledgedHistoricalLocationChange,
					),
				}),

			// `is_active` is a column the client can see, so a write that sets it
			// arrives here as one of these two names rather than as a details edit
			// carrying the column. Which of the two it is, is the client's to say.
			'weather.deactivateWeatherStation': ({ payload, agency, id }) =>
				deactivateWeatherStationCommand({
					...agency,
					weatherStationId: id,
					expectedUpdatedAt: readDate(payload.expectedUpdatedAt),
				}),

			'weather.reactivateWeatherStation': ({ payload, agency, id }) =>
				reactivateWeatherStationCommand({
					...agency,
					weatherStationId: id,
					expectedUpdatedAt: readDate(payload.expectedUpdatedAt),
				}),

			'weather.deleteWeatherStation': ({ payload, agency, id }) =>
				deleteWeatherStationCommand({
					...agency,
					weatherStationId: id,
					expectedUpdatedAt: readDate(payload.expectedUpdatedAt),
					acknowledgedSummaryDeletion: acknowledged(payload.acknowledgedSummaryDeletion),
				}),
		},
	};
}

export function weatherSummaryTableCommands(
	db: CommandDb,
): TableCommands<WeatherCommand, SafeWeatherSummary> {
	return {
		table: 'weather_summaries',
		run: {
			db,
			write: writeWeatherSummaryCommand,
			notFound: 'weather_summary_not_found',
			key: 'weatherSummary',
		},
		intents: {
			'weather.createWeatherSummary': ({ payload, agency, authContext, id }) => {
				const startDate = readText(payload.start_date) ?? '';
				const endDate = readText(payload.end_date) ?? startDate;
				assertNotFuture({ startDate, endDate }, authContext.timeZone);
				return createWeatherSummaryCommand({
					...agency,
					weatherSummaryId: id,
					weatherStationId: readText(payload.weather_source_id) ?? '',
					startDate,
					// A same-day bucket stores `end_date = start_date`; the domain never
					// emits a null end, so a client that sends only a start means one day.
					endDate,
					...readMetrics(payload),
				});
			},

			'weather.updateWeatherSummary': ({ payload, agency, authContext, id }) => {
				const startDate =
					'start_date' in payload ? (readText(payload.start_date) ?? '') : undefined;
				const endDate = 'end_date' in payload ? (readText(payload.end_date) ?? '') : undefined;
				// Only the ends this request moves. The stored half of a partly-moved
				// bucket is already in the past by definition, and the writer is what
				// re-checks the pair for ordering and overlap.
				assertNotFuture({ startDate, endDate }, authContext.timeZone);
				return updateWeatherSummaryCommand({
					...agency,
					weatherSummaryId: id,
					expectedUpdatedAt: readDate(payload.expectedUpdatedAt),
					...(startDate !== undefined ? { startDate } : {}),
					...(endDate !== undefined ? { endDate } : {}),
					...readMetricPatch(payload),
				});
			},

			'weather.deleteWeatherSummary': ({ payload, agency, id }) =>
				deleteWeatherSummaryCommand({
					...agency,
					weatherSummaryId: id,
					expectedUpdatedAt: readDate(payload.expectedUpdatedAt),
				}),
		},
	};
}

/**
 * The seven metrics, as a create command takes them.
 *
 * Every field is present and `null` where the row has no reading, because the
 * domain requires at least one metric and counts an absent field the same as a
 * null one. A create that names none is refused by the builder.
 */
function readMetrics(payload: Record<string, unknown>): Record<string, number | null> {
	return {
		temperatureMinF: readNumber(payload.temperature_min_f),
		temperatureMaxF: readNumber(payload.temperature_max_f),
		precipitationInches: readNumber(payload.precipitation_inches),
		relativeHumidityMin: readNumber(payload.relative_humidity_min),
		relativeHumidityMax: readNumber(payload.relative_humidity_max),
		windSpeedMinMph: readNumber(payload.wind_speed_min_mph),
		windSpeedMaxMph: readNumber(payload.wind_speed_max_mph),
	};
}

/**
 * The metrics an update names, and only those.
 *
 * Patch semantics turn on the difference between a key that is absent and one
 * that carries `null`: absent leaves the stored reading alone, null clears it.
 * So this cannot go through {@link readMetrics}, which fills in every field.
 */
function readMetricPatch(payload: Record<string, unknown>): Record<string, number | null> {
	const patch: Record<string, number | null> = {};
	for (const [column, field] of METRIC_COLUMNS) {
		if (column in payload) {
			patch[field] = readNumber(payload[column]);
		}
	}
	return patch;
}

const METRIC_COLUMNS: readonly (readonly [string, string])[] = [
	['temperature_min_f', 'temperatureMinF'],
	['temperature_max_f', 'temperatureMaxF'],
	['precipitation_inches', 'precipitationInches'],
	['relative_humidity_min', 'relativeHumidityMin'],
	['relative_humidity_max', 'relativeHumidityMax'],
	['wind_speed_min_mph', 'windSpeedMinMph'],
	['wind_speed_max_mph', 'windSpeedMaxMph'],
];

/**
 * A reading, or none.
 *
 * `null` for anything that is not a finite number, including the string a form
 * sends for an empty field. The domain rejects a value out of bounds or with more
 * than two decimals; what this decides is only whether a reading arrived at all.
 */
function readNumber(value: unknown): number | null {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

/**
 * Refuse a bucket that runs past today in the agency's zone.
 *
 * Raised as a `DomainValidationError` so it lands as the same `invalid_command`
 * 400 with an issue path that a builder rejection does. To a client this is one
 * kind of answer, "that field is wrong, here is which", and the fact that this
 * particular rule needed a setting to decide is not something a form should have
 * to handle differently.
 */
function assertNotFuture(
	bucket: { readonly startDate?: string | undefined; readonly endDate?: string | undefined },
	timeZone: string,
): void {
	const today = todayInTimeZone(timeZone);
	const issues = (['startDate', 'endDate'] as const)
		.filter((field) => {
			const value = bucket[field];
			return value !== undefined && value !== '' && value > today;
		})
		.map((field) => ({ path: field, message: `${field} cannot be in the future.` }));
	if (issues.length > 0) {
		throw new DomainValidationError('Weather summary command is invalid.', issues);
	}
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

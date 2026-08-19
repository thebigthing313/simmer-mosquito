/**
 * The three manual summary commands, against `weather_summaries`.
 *
 * A summary is one bucket of weather at one station: an inclusive start and end
 * calendar date, and at least one of the seven metrics. Same-day buckets store
 * `end_date = start_date`, and multi-day buckets are ordinary — a rain gauge read
 * every third day is three days of precipitation in one row, which is why the
 * metrics are totals and min/max rather than daily readings.
 *
 * ## The invariant the database cannot hold
 *
 * Buckets for one station must not overlap. Exact duplicates are refused by
 * `weather_summaries_source_range_unique`, but a bucket that merely *straddles*
 * another is not a duplicate of anything, and refusing it needs a range test the
 * schema has no exclusion constraint for. `docs/weather-domain.md` settles that
 * deliberately: no `btree_gist`, no exclusion constraint, and the no-overlap rule
 * is a command-handler invariant in v1.
 *
 * So it is checked here, inside the write transaction, against the station's
 * stored buckets. A concurrent writer could still slip a straddling row in
 * between the read and the insert; the unique index catches the exact-duplicate
 * case, and the doc names the rest as the cost of not adding the constraint.
 *
 * ## Dates are strings all the way through
 *
 * Every comparison is between calendar days, so `start_date` and `end_date` are
 * read back as text and written with `localDateColumn`. Reading a `date` column
 * as a `Date` produces a timestamp at local midnight, which sorts and compares by
 * an offset nobody asked for — the trap `docs/adult-surveillance-domain.md`'s
 * timing modes hit from the other direction.
 */

import type { WeatherCommand } from '@simmer-mosquito/domain';
import { refusableWrite } from '../table-commands/shared.js';
import {
	assertFresh,
	bucketsOverlap,
	CommandError,
	loadStation,
	loadStationSummaries,
	loadSummary,
	localDateColumn,
	type SafeWeatherSummary,
	toSafeWeatherSummary,
	type WeatherTransaction,
	weatherSummaryReturnColumns,
} from './shared.js';

/**
 * The 409 an exact duplicate bucket becomes.
 *
 * The overlap check below already refuses every overlapping bucket it can see, so
 * reaching this means two writers raced for the same bucket. Same answer either
 * way, and one of them has to lose.
 */
const DUPLICATE_BUCKET = {
	error: 'weather_summary_duplicate',
	reason: 'This station already has a summary covering those dates.',
};

/**
 * The three manual summary commands, dispatched.
 *
 * Each arm is its own function, for the same reason the station writer's are:
 * all three resolve a row and then check the same bucket rules, and the
 * differences between them are only visible read side by side.
 */
export async function writeWeatherSummaryCommand(
	trx: WeatherTransaction,
	command: WeatherCommand,
): Promise<SafeWeatherSummary | null> {
	switch (command.type) {
		case 'weather.createWeatherSummary':
			return createSummary(trx, command.payload);
		case 'weather.updateWeatherSummary':
			return updateSummary(trx, command.payload);
		case 'weather.deleteWeatherSummary':
			return deleteSummary(trx, command.payload);
		default:
			throw new Error(`Unsupported weather summary command: ${command.type}`);
	}
}

type CreatePayload = Extract<
	WeatherCommand,
	{ readonly type: 'weather.createWeatherSummary' }
>['payload'];
type UpdatePayload = Extract<
	WeatherCommand,
	{ readonly type: 'weather.updateWeatherSummary' }
>['payload'];
type DeletePayload = Extract<
	WeatherCommand,
	{ readonly type: 'weather.deleteWeatherSummary' }
>['payload'];

async function createSummary(
	trx: WeatherTransaction,
	payload: CreatePayload,
): Promise<SafeWeatherSummary | null> {
	const station = await loadStation(trx, payload.weatherStationId, payload.organizationId);
	if (station === undefined) {
		return null;
	}
	// Manual entry requires an *active* station, which update and delete do not:
	// an inactive station is one an agency has stopped reading, so correcting its
	// history stays open while adding to it does not.
	if (!station.isActive) {
		throw new CommandError(409, {
			error: 'weather_station_inactive',
			reason: 'This weather station is inactive. Reactivate it before adding summaries.',
		});
	}
	await assertNoOverlap(trx, station.id, payload, null);
	const row = await refusableWrite(
		() =>
			trx
				.insertInto('weather_summaries')
				.values({
					id: payload.weatherSummaryId,
					// Set rather than left to the FK, because `shape-scopes.ts` reads this
					// table as `organization-or-global`: a null here would sync the row to
					// every agency.
					organization_id: payload.organizationId,
					weather_source_id: station.id,
					start_date: localDateColumn(payload.startDate),
					end_date: localDateColumn(payload.endDate),
					temperature_min_f: payload.temperatureMinF,
					temperature_max_f: payload.temperatureMaxF,
					precipitation_inches: payload.precipitationInches,
					relative_humidity_min: payload.relativeHumidityMin,
					relative_humidity_max: payload.relativeHumidityMax,
					wind_speed_min_mph: payload.windSpeedMinMph,
					wind_speed_max_mph: payload.windSpeedMaxMph,
					created_by_profile_id: payload.actorProfileId,
					updated_by_profile_id: payload.actorProfileId,
				})
				.returning(weatherSummaryReturnColumns)
				.executeTakeFirstOrThrow(),
		{ duplicate: DUPLICATE_BUCKET },
	);
	return toSafeWeatherSummary(row);
}

async function updateSummary(
	trx: WeatherTransaction,
	payload: UpdatePayload,
): Promise<SafeWeatherSummary | null> {
	const summary = await loadSummary(trx, payload.weatherSummaryId, payload.organizationId);
	if (summary === undefined) {
		return null;
	}
	assertFresh(payload.expectedUpdatedAt, summary.updatedAt, 'weather_summary');

	// Patch semantics: a date the request did not name keeps the stored one, and
	// the pair that results is what the overlap rule judges. Checking only the
	// submitted half would let a client widen a bucket over its neighbour by
	// moving one end at a time.
	const { changes } = payload;
	const startDate = changes.startDate ?? summary.startDate;
	const endDate = changes.endDate ?? summary.endDate;
	if (endDate < startDate) {
		throw new CommandError(400, {
			error: 'invalid_command',
			reason: 'endDate must be on or after startDate.',
		});
	}
	await assertNoOverlap(trx, summary.weatherStationId, { startDate, endDate }, summary.id);

	const row = await refusableWrite(
		() =>
			trx
				.updateTable('weather_summaries')
				.set({
					...(changes.startDate !== undefined
						? { start_date: localDateColumn(changes.startDate) }
						: {}),
					...(changes.endDate !== undefined ? { end_date: localDateColumn(changes.endDate) } : {}),
					// Every metric is `number | null | undefined` in the patch, and the
					// three mean different things: a number sets, an explicit null clears,
					// `undefined` leaves the stored value alone. So the key has to be
					// absent rather than set to undefined.
					...metricChanges(changes),
					updated_by_profile_id: payload.actorProfileId,
					updated_at: new Date(),
				})
				.where('id', '=', summary.id)
				.returning(weatherSummaryReturnColumns)
				.executeTakeFirst(),
		{ duplicate: DUPLICATE_BUCKET },
	);
	return row === undefined ? null : toSafeWeatherSummary(row);
}

async function deleteSummary(
	trx: WeatherTransaction,
	payload: DeletePayload,
): Promise<SafeWeatherSummary | null> {
	const summary = await loadSummary(trx, payload.weatherSummaryId, payload.organizationId);
	// Not idempotent, by the domain's rule: a second delete finds nothing and
	// answers 404 rather than pretending to have removed a row again.
	if (summary === undefined) {
		return null;
	}
	assertFresh(payload.expectedUpdatedAt, summary.updatedAt, 'weather_summary');
	const row = await trx
		.deleteFrom('weather_summaries')
		.where('id', '=', summary.id)
		.returning(weatherSummaryReturnColumns)
		.executeTakeFirst();
	return row === undefined ? null : toSafeWeatherSummary(row);
}

/**
 * The metric columns a patch actually names.
 *
 * Written out rather than looped over a field list, because the loop would need
 * the camelCase-to-snake_case mapping as data and that mapping is the one thing
 * a reader of this file wants to see.
 */
function metricChanges(changes: {
	readonly temperatureMinF?: number | null;
	readonly temperatureMaxF?: number | null;
	readonly precipitationInches?: number | null;
	readonly relativeHumidityMin?: number | null;
	readonly relativeHumidityMax?: number | null;
	readonly windSpeedMinMph?: number | null;
	readonly windSpeedMaxMph?: number | null;
}): Record<string, number | null> {
	return {
		...(changes.temperatureMinF !== undefined
			? { temperature_min_f: changes.temperatureMinF }
			: {}),
		...(changes.temperatureMaxF !== undefined
			? { temperature_max_f: changes.temperatureMaxF }
			: {}),
		...(changes.precipitationInches !== undefined
			? { precipitation_inches: changes.precipitationInches }
			: {}),
		...(changes.relativeHumidityMin !== undefined
			? { relative_humidity_min: changes.relativeHumidityMin }
			: {}),
		...(changes.relativeHumidityMax !== undefined
			? { relative_humidity_max: changes.relativeHumidityMax }
			: {}),
		...(changes.windSpeedMinMph !== undefined
			? { wind_speed_min_mph: changes.windSpeedMinMph }
			: {}),
		...(changes.windSpeedMaxMph !== undefined
			? { wind_speed_max_mph: changes.windSpeedMaxMph }
			: {}),
	};
}

/**
 * Refuse a bucket that shares a day with another of the station's.
 *
 * `exceptSummaryId` is the row being edited, which necessarily overlaps itself.
 * Adjacent buckets are fine — 1st to 3rd followed by 4th to 6th — because the
 * ends are inclusive and the days do not repeat.
 */
async function assertNoOverlap(
	trx: WeatherTransaction,
	weatherStationId: string,
	bucket: { readonly startDate: string; readonly endDate: string },
	exceptSummaryId: string | null,
): Promise<void> {
	const existing = await loadStationSummaries(trx, weatherStationId);
	const clash = existing.find(
		(stored) => stored.weatherSummaryId !== exceptSummaryId && bucketsOverlap(bucket, stored),
	);
	if (clash !== undefined) {
		throw new CommandError(409, {
			error: 'weather_summary_overlap',
			reason: `Those dates overlap the summary covering ${clash.startDate} to ${clash.endDate}.`,
		});
	}
}

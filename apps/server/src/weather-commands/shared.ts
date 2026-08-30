/**
 * What the weather writers share: the scoped row reads, and the refusals every
 * station and summary mutation can raise.
 *
 * ## Why these tables do not use `updateRow` and `softDelete`
 *
 * Both shared helpers take an `OrgOwnedTable`, which the schema derives as "has
 * a non-null `organization_id`, a `deleted_at`, and an `updated_at`". Neither
 * weather table qualifies. `weather_sources.organization_id` is nullable so a
 * future provider-owned station can exist with no agency behind it, which
 * `docs/weather-domain.md` keeps as plumbing for `source_type = 'nws'` while v1
 * writes only `'organization'` rows. `weather_summaries` is nullable for the
 * same reason, and has no `deleted_at` at all, because a summary delete is a
 * hard delete.
 *
 * So the tenancy predicate is written out here instead. It is the same predicate
 * It is the same predicate on `id`, `organization_id`, and for stations
 * `deleted_at is null`, and what
 * makes writing it out safe is that it is written once, here, rather than at
 * each of the ten call sites.
 *
 * A null `organization_id` compares unequal to every agency id, so a global row
 * is unreachable through these helpers rather than merely unlikely to be named.
 * That matters more than usual: `shape-scopes.ts` reads both tables as
 * `organization-or-global`, so a row written with a null org would sync to every
 * agency. Every insert below sets it.
 */

import { localDateColumn, type SelectedRow, sql } from '@simmer-mosquito/db';
import type { MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { CommandError } from '../command-endpoint.js';
import type { CommandDb, CommandTransaction } from '../command-write.js';

export type WeatherDb = CommandDb;
export type WeatherTransaction = CommandTransaction;
export { CommandError, localDateColumn };

export interface RouteOptions {
	readonly db: WeatherDb;
	readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
}

// ===========================================================================
// Response shaping
// ===========================================================================

/**
 * `geom` and `geojson` are absent for the same reason they are absent from the
 * client's row schema: geometry is served by the `/map/*` endpoints, and the
 * generated `lat`/`lng`/`geom_type` columns are what a collection carries.
 */
export const weatherStationReturnColumns = [
	'id',
	'organization_id',
	'lat',
	'lng',
	'geom_type',
	'source_type',
	'source_name',
	'source_code',
	'provider_source_id',
	'is_active',
	'metadata',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

export type WeatherStationRow = SelectedRow<'weather_sources', typeof weatherStationReturnColumns>;

export const weatherSummaryReturnColumns = [
	'id',
	'organization_id',
	'weather_source_id',
	'start_date',
	'end_date',
	'temperature_min_f',
	'temperature_max_f',
	'precipitation_inches',
	'relative_humidity_min',
	'relative_humidity_max',
	'wind_speed_min_mph',
	'wind_speed_max_mph',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

export type WeatherSummaryRow = SelectedRow<
	'weather_summaries',
	typeof weatherSummaryReturnColumns
>;

// ===========================================================================
// Scoped reads
// ===========================================================================

/** A station as the handlers need it before deciding whether a write may run. */
export interface StationState {
	readonly id: string;
	readonly isActive: boolean;
	readonly updatedAt: Date;
}

/**
 * The agency's own station, or `undefined`.
 *
 * `source_type` is not filtered. An agency's rows are all `'organization'` in
 * v1, and a station that somehow carried the other type while naming this
 * organization would still be that agency's row to manage, filtering it out
 * would answer 404 for a row the agency can see in its own list.
 */
export async function loadStation(
	trx: WeatherTransaction,
	weatherStationId: string,
	organizationId: string,
): Promise<StationState | undefined> {
	const row = await trx
		.selectFrom('weather_sources')
		.select(['id', 'is_active', 'updated_at'])
		.where('id', '=', weatherStationId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row === undefined
		? undefined
		: { id: row.id, isActive: row.is_active, updatedAt: row.updated_at };
}

/** A summary and the station it hangs off, scoped to the agency in one read. */
export interface SummaryState {
	readonly id: string;
	readonly weatherStationId: string;
	readonly startDate: string;
	readonly endDate: string;
	readonly updatedAt: Date;
	/**
	 * The readings the row currently holds.
	 *
	 * Carried because a patch is judged on the row it *produces*, not on the
	 * fields it names: "at least one metric" and "min before max" are rules about
	 * the stored result, and a patch naming one half of a pair cannot be judged
	 * without the other half.
	 */
	readonly metrics: SummaryMetrics;
}

/** The seven readings a summary can hold. */
export interface SummaryMetrics {
	readonly temperatureMinF: number | null;
	readonly temperatureMaxF: number | null;
	readonly precipitationInches: number | null;
	readonly relativeHumidityMin: number | null;
	readonly relativeHumidityMax: number | null;
	readonly windSpeedMinMph: number | null;
	readonly windSpeedMaxMph: number | null;
}

/**
 * The agency's own summary, or `undefined`.
 *
 * Joined to the station rather than trusting `weather_summaries.organization_id`
 * alone. The column is what the sync scope reads and every write here sets it,
 * but the station is where the tenancy is anchored, a summary is reachable only
 * through one, and the join is also what enforces "never a deleted station".
 *
 * The dates come back as text. A `date` column read as a `Date` is a timestamp at
 * local midnight, and every comparison the overlap rules make is between calendar
 * days, so the string is the value and the `Date` is a lossy rendering of it.
 */
export async function loadSummary(
	trx: WeatherTransaction,
	weatherSummaryId: string,
	organizationId: string,
): Promise<SummaryState | undefined> {
	const row = await trx
		.selectFrom('weather_summaries')
		.innerJoin('weather_sources', 'weather_sources.id', 'weather_summaries.weather_source_id')
		.select([
			'weather_summaries.id as id',
			'weather_summaries.weather_source_id as weather_source_id',
			'weather_summaries.updated_at as updated_at',
			'weather_summaries.temperature_min_f as temperature_min_f',
			'weather_summaries.temperature_max_f as temperature_max_f',
			'weather_summaries.precipitation_inches as precipitation_inches',
			'weather_summaries.relative_humidity_min as relative_humidity_min',
			'weather_summaries.relative_humidity_max as relative_humidity_max',
			'weather_summaries.wind_speed_min_mph as wind_speed_min_mph',
			'weather_summaries.wind_speed_max_mph as wind_speed_max_mph',
			sql<string>`weather_summaries.start_date::text`.as('start_date'),
			sql<string>`weather_summaries.end_date::text`.as('end_date'),
		])
		.where('weather_summaries.id', '=', weatherSummaryId)
		.where('weather_sources.organization_id', '=', organizationId)
		.where('weather_sources.deleted_at', 'is', null)
		.executeTakeFirst();
	return row === undefined
		? undefined
		: {
				id: row.id,
				weatherStationId: row.weather_source_id,
				startDate: row.start_date,
				endDate: row.end_date,
				updatedAt: row.updated_at,
				metrics: {
					temperatureMinF: row.temperature_min_f,
					temperatureMaxF: row.temperature_max_f,
					precipitationInches: row.precipitation_inches,
					relativeHumidityMin: row.relative_humidity_min,
					relativeHumidityMax: row.relative_humidity_max,
					windSpeedMinMph: row.wind_speed_min_mph,
					windSpeedMaxMph: row.wind_speed_max_mph,
				},
			};
}

/** One summary bucket of a station, as the overlap and assessment rules read it. */
export interface SummaryBucket {
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

/** Every summary a station holds, for the checks that compare against all of them. */
export async function loadStationSummaries(
	trx: WeatherTransaction,
	weatherStationId: string,
): Promise<readonly SummaryBucket[]> {
	const rows = await trx
		.selectFrom('weather_summaries')
		.select([
			'id',
			'temperature_min_f',
			'temperature_max_f',
			'precipitation_inches',
			'relative_humidity_min',
			'relative_humidity_max',
			'wind_speed_min_mph',
			'wind_speed_max_mph',
			sql<string>`start_date::text`.as('start_date'),
			sql<string>`end_date::text`.as('end_date'),
		])
		.where('weather_source_id', '=', weatherStationId)
		.orderBy('start_date')
		.execute();
	return rows.map((row) => ({
		weatherSummaryId: row.id,
		startDate: row.start_date,
		endDate: row.end_date,
		temperatureMinF: row.temperature_min_f,
		temperatureMaxF: row.temperature_max_f,
		precipitationInches: row.precipitation_inches,
		relativeHumidityMin: row.relative_humidity_min,
		relativeHumidityMax: row.relative_humidity_max,
		windSpeedMinMph: row.wind_speed_min_mph,
		windSpeedMaxMph: row.wind_speed_max_mph,
	}));
}

// ===========================================================================
// The refusals
// ===========================================================================

/**
 * Optimistic concurrency, where the command asked for it.
 *
 * `expectedUpdatedAt` is optional across the whole domain: absent means
 * last-write-wins, which is what a form that never loaded a version can honestly
 * promise. Supplied and stale is a 409, so a client can say what it was about to
 * overwrite rather than only that it failed.
 */
export function assertFresh(expected: Date | null, actual: Date, entity: string): void {
	if (expected !== null && expected.getTime() !== actual.getTime()) {
		throw new CommandError(409, {
			error: `${entity}_conflict`,
			reason: 'This record changed since it was loaded.',
		});
	}
}

/** Two inclusive calendar-day buckets that share at least one day. */
export function bucketsOverlap(
	left: { readonly startDate: string; readonly endDate: string },
	right: { readonly startDate: string; readonly endDate: string },
): boolean {
	return left.startDate <= right.endDate && right.startDate <= left.endDate;
}

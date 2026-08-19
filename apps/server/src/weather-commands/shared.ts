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
 * — `id`, `organization_id`, and for stations `deleted_at is null` — and what
 * makes writing it out safe is that it is written once, here, rather than at
 * each of the ten call sites.
 *
 * A null `organization_id` compares unequal to every agency id, so a global row
 * is unreachable through these helpers rather than merely unlikely to be named.
 * That matters more than usual: `shape-scopes.ts` reads both tables as
 * `organization-or-global`, so a row written with a null org would sync to every
 * agency. Every insert below sets it.
 */

import { localDateColumn, sql } from '@simmer-mosquito/db';
import type { MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import { CommandError, commandEndpoint } from '../command-endpoint.js';
import type { CommandDb, CommandTransaction } from '../command-write.js';

export type WeatherDb = CommandDb;
export type WeatherTransaction = CommandTransaction;
export { CommandError, commandEndpoint, localDateColumn };

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
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

export interface SafeWeatherStation {
	readonly id: string;
	readonly organizationId: string | null;
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
	readonly sourceType: 'organization' | 'nws';
	readonly stationName: string;
	readonly stationCode: string | null;
	readonly providerSourceId: string | null;
	readonly isActive: boolean;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeWeatherStation(row: {
	readonly id: string;
	readonly organization_id: string | null;
	readonly lat: number;
	readonly lng: number;
	readonly geom_type: string;
	readonly source_type: 'organization' | 'nws';
	readonly source_name: string;
	readonly source_code: string | null;
	readonly provider_source_id: string | null;
	readonly is_active: boolean;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeWeatherStation {
	return {
		id: row.id,
		organizationId: row.organization_id,
		lat: row.lat,
		lng: row.lng,
		geomType: row.geom_type,
		sourceType: row.source_type,
		// The domain says "weather station" and the table says `weather_sources`;
		// `docs/weather-domain.md` names that gap and keeps the domain's word.
		stationName: row.source_name,
		stationCode: row.source_code,
		providerSourceId: row.provider_source_id,
		isActive: row.is_active,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

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

export interface SafeWeatherSummary {
	readonly id: string;
	readonly organizationId: string | null;
	readonly weatherStationId: string;
	readonly startDate: Date;
	readonly endDate: Date;
	readonly temperatureMinF: number | null;
	readonly temperatureMaxF: number | null;
	readonly precipitationInches: number | null;
	readonly relativeHumidityMin: number | null;
	readonly relativeHumidityMax: number | null;
	readonly windSpeedMinMph: number | null;
	readonly windSpeedMaxMph: number | null;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeWeatherSummary(row: {
	readonly id: string;
	readonly organization_id: string | null;
	readonly weather_source_id: string;
	readonly start_date: Date;
	readonly end_date: Date;
	readonly temperature_min_f: number | null;
	readonly temperature_max_f: number | null;
	readonly precipitation_inches: number | null;
	readonly relative_humidity_min: number | null;
	readonly relative_humidity_max: number | null;
	readonly wind_speed_min_mph: number | null;
	readonly wind_speed_max_mph: number | null;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeWeatherSummary {
	return {
		id: row.id,
		organizationId: row.organization_id,
		weatherStationId: row.weather_source_id,
		startDate: row.start_date,
		endDate: row.end_date,
		temperatureMinF: row.temperature_min_f,
		temperatureMaxF: row.temperature_max_f,
		precipitationInches: row.precipitation_inches,
		relativeHumidityMin: row.relative_humidity_min,
		relativeHumidityMax: row.relative_humidity_max,
		windSpeedMinMph: row.wind_speed_min_mph,
		windSpeedMaxMph: row.wind_speed_max_mph,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

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
 * organization would still be that agency's row to manage — filtering it out
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
}

/**
 * The agency's own summary, or `undefined`.
 *
 * Joined to the station rather than trusting `weather_summaries.organization_id`
 * alone. The column is what the sync scope reads and every write here sets it,
 * but the station is where the tenancy is anchored — a summary is reachable only
 * through one — and the join is also what enforces "never a deleted station".
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

/** Whether a station has any summaries, which is what the acknowledgements turn on. */
export async function stationHasSummaries(
	trx: WeatherTransaction,
	weatherStationId: string,
): Promise<boolean> {
	const row = await trx
		.selectFrom('weather_summaries')
		.select('id')
		.where('weather_source_id', '=', weatherStationId)
		.limit(1)
		.executeTakeFirst();
	return row !== undefined;
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

/**
 * An acknowledgement the caller has to have given, raised as a 409 rather than a
 * 400.
 *
 * The request is well-formed and the domain built the command; what is missing is
 * confirmation that a consequence is intended. That turns on the stored rows —
 * whether summaries exist — so it cannot be a builder rule, and a 400 would tell
 * a client its payload was malformed when the fix is a second question to the
 * user.
 */
export function assertAcknowledged(acknowledged: boolean, error: string, reason: string): void {
	if (!acknowledged) {
		throw new CommandError(409, { error, reason });
	}
}

/** Two inclusive calendar-day buckets that share at least one day. */
export function bucketsOverlap(
	left: { readonly startDate: string; readonly endDate: string },
	right: { readonly startDate: string; readonly endDate: string },
): boolean {
	return left.startDate <= right.endDate && right.startDate <= left.endDate;
}

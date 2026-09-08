/**
 * A station's readings: adding a bucket, correcting one, removing one.
 *
 * A summary is one station's weather over one inclusive stretch of calendar days
 * A single day for a daily log, three for a rain gauge read every third day,
 * and at least one of the seven metrics. The metrics are totals and min/max over
 * the bucket rather than daily figures, which is what makes a multi-day bucket a
 * legitimate record rather than a lossy one.
 *
 * ## The dates are strings and stay strings
 *
 * `start_date` and `end_date` are Postgres `date` columns, and the row schema
 * keeps them as `YYYY-MM-DD` rather than parsing. A `Date` built from a bare date
 * string is midnight UTC, which renders as the previous day anywhere west of
 * Greenwich, so a bucket entered on the 3rd would show as the 2nd, and, worse,
 * would be *sent* as the 2nd if it ever round-tripped through a `Date`.
 *
 * ## A metric that is absent and one that is null are different writes
 *
 * The update command has patch semantics per metric: a number sets it, an
 * explicit `null` clears it, and an absent key leaves the stored reading alone.
 * {@link summaryChanges} keeps that distinction by building the change set from
 * the fields the form actually holds, every one of them, since the form shows
 * every metric and an emptied box means "clear this".
 *
 * The import is the other rule and does not go through here: an imported row
 * replaces the whole metric set, because a spreadsheet row is the entire reading
 * for that bucket rather than an edit to part of it.
 */

import { settleWrite, type WeatherSummary } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { mutateCollection } from '../../lib/collections/mutate';
import { weather_summaries } from '../../lib/collections/weather_summaries';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { optimisticStamp } from './shared';

/** The seven metrics a summary can carry, each `null` where there is no reading. */
export interface WeatherMetrics {
	readonly temperatureMinF: number | null;
	readonly temperatureMaxF: number | null;
	readonly precipitationInches: number | null;
	readonly relativeHumidityMin: number | null;
	readonly relativeHumidityMax: number | null;
	readonly windSpeedMinMph: number | null;
	readonly windSpeedMaxMph: number | null;
}

/** A summary as its form holds one. */
export interface WeatherSummaryFields extends WeatherMetrics {
	/** `YYYY-MM-DD`. Never a `Date`, see the module comment. */
	readonly startDate: string;
	/** Inclusive, and equal to `startDate` for a single-day bucket. */
	readonly endDate: string;
}

/**
 * Every column a summary's fields decide, all of them required.
 *
 * Not `Partial`: this returns all nine every time, and typing it as a partial is
 * what stopped the optimistic insert being checked for completeness. An update
 * still accepts it, because a full set is a valid change set.
 */
type SummaryColumns = Pick<
	WeatherSummary,
	| 'start_date'
	| 'end_date'
	| 'temperature_min_f'
	| 'temperature_max_f'
	| 'precipitation_inches'
	| 'relative_humidity_min'
	| 'relative_humidity_max'
	| 'wind_speed_min_mph'
	| 'wind_speed_max_mph'
>;

/**
 * The columns a summary's fields become.
 *
 * Used by both the create and the save, so the two cannot spell a column
 * differently.
 */
function summaryChanges(fields: WeatherSummaryFields): SummaryColumns {
	return {
		start_date: fields.startDate,
		end_date: fields.endDate,
		temperature_min_f: fields.temperatureMinF,
		temperature_max_f: fields.temperatureMaxF,
		precipitation_inches: fields.precipitationInches,
		relative_humidity_min: fields.relativeHumidityMin,
		relative_humidity_max: fields.relativeHumidityMax,
		wind_speed_min_mph: fields.windSpeedMinMph,
		wind_speed_max_mph: fields.windSpeedMaxMph,
	};
}

export interface WeatherSummaryMutations {
	readonly create: (input: {
		readonly weatherSummaryId: string;
		readonly weatherStationId: string;
		readonly fields: WeatherSummaryFields;
	}) => Promise<void>;
	readonly save: (input: {
		readonly weatherSummaryId: string;
		readonly fields: WeatherSummaryFields;
	}) => Promise<void>;
	readonly remove: (weatherSummaryId: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useWeatherSummaryMutations(): WeatherSummaryMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const create = useCallback(
		async (input: {
			readonly weatherSummaryId: string;
			readonly weatherStationId: string;
			readonly fields: WeatherSummaryFields;
		}) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}
			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(weather_summaries(), {
					operation: 'insert',
					intent: 'weather.createWeatherSummary',
					row: {
						id: input.weatherSummaryId,
						organization_id: organizationId,
						weather_source_id: input.weatherStationId,
						...summaryChanges(input.fields),
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies WeatherSummary,
					arguments: {},
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(
		async (input: { readonly weatherSummaryId: string; readonly fields: WeatherSummaryFields }) => {
			await settleWrite(
				mutateCollection(weather_summaries(), {
					operation: 'update',
					intent: 'weather.updateWeatherSummary',
					key: input.weatherSummaryId,
					changes: {
						...summaryChanges(input.fields),
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(async (weatherSummaryId: string) => {
		await settleWrite(
			mutateCollection(weather_summaries(), {
				operation: 'delete',
				intent: 'weather.deleteWeatherSummary',
				key: weatherSummaryId,
			}),
		);
	}, []);

	return {
		create,
		save,
		remove,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}

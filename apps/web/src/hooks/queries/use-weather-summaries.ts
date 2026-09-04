/**
 * A station's recent **Weather Summaries**, newest first.
 *
 * On-demand, because a summary is one station's one reporting period and an
 * agency accumulates them faster than any other weather record — nothing wants
 * the whole table, and one station's detail page is exactly the subset the mode
 * exists for.
 *
 * `useLiveQuery` rather than the suspense variant, deliberately: the suspense
 * hook sticks after a navigation unmounts it on an on-demand collection, so the
 * caller gates on `isReady` instead. See `use-weather-station.ts` for the
 * station itself, which is eager and needs no such care.
 *
 * ## The dates are strings, and stay strings
 *
 * `start_date` and `end_date` are Postgres `date` columns, which the row schema
 * keeps as `YYYY-MM-DD` rather than parsing — a `Date` built from a bare date
 * string is midnight UTC, and rendering that in a western timezone shows the day
 * before. `summaryPeriodLabel` reads the parts directly for the same reason.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { weather_summaries } from '../../lib/collections/weather_summaries';
import { unmatchableId } from './shared';

/** How long a station's summaries stay warm after the detail page unmounts. */
const summariesGcTimeMs = 30_000;

export interface WeatherSummaryListing {
	readonly id: string;
	/** `YYYY-MM-DD`. Never a `Date` — see the module comment. */
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

export function useWeatherSummaries(stationId: string | null): {
	readonly summaries: readonly WeatherSummaryListing[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: summariesGcTimeMs,
			query: (query) =>
				query
					.from({ summary: weather_summaries() })
					.where(({ summary }) => eq(summary.weather_source_id, stationId ?? unmatchableId))
					.orderBy(({ summary }) => summary.end_date, 'desc')
					.select(({ summary }) => ({
						id: summary.id,
						startDate: summary.start_date,
						endDate: summary.end_date,
						temperatureMinF: summary.temperature_min_f,
						temperatureMaxF: summary.temperature_max_f,
						precipitationInches: summary.precipitation_inches,
						relativeHumidityMin: summary.relative_humidity_min,
						relativeHumidityMax: summary.relative_humidity_max,
						windSpeedMinMph: summary.wind_speed_min_mph,
						windSpeedMaxMph: summary.wind_speed_max_mph,
					})),
		},
		[stationId],
	);

	return { summaries: result.data, isReady: result.isReady, isError: result.isError };
}

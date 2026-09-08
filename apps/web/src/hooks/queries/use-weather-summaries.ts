/**
 * A station's **Weather Summaries**, newest first.
 *
 * On-demand, because a summary is one station's one reporting period and an
 * organization accumulates them faster than any other weather record. Nothing
 * wants the whole table, and one station's detail page is exactly the subset
 * the mode exists for.
 *
 * `useLiveQuery` rather than the suspense variant, deliberately: the suspense
 * hook sticks after a navigation unmounts it on an on-demand collection, so the
 * caller gates on `isReady` instead. See `use-weather-station.ts` for the
 * station itself, which is eager and needs no such care.
 *
 * ## Two reads, and they are not interchangeable
 *
 * The detail card shows one year at a time, because a station logged daily for
 * ten years is 3,650 rows in one table. The import page compares a parsed file
 * against everything the station holds, because a year bound there would report
 * a row that overwrites a 2019 reading as an insert. So the year bound is a
 * parameter of {@link useWeatherSummaries} and {@link useAllWeatherSummaries} is
 * the import page's, named so that reaching for the whole set is a decision.
 *
 * ## The dates are strings, and stay strings
 *
 * `start_date` and `end_date` are Postgres `date` columns, which the row schema
 * keeps as `YYYY-MM-DD` rather than parsing. A `Date` built from a bare date
 * string is midnight UTC, and rendering that in a western timezone shows the day
 * before. `summaryPeriodLabel` reads the parts directly for the same reason, and
 * so does {@link summaryYear}.
 */

import { and, eq, gte, lte, useLiveQuery } from '@tanstack/react-db';
import { weather_summaries } from '../../lib/collections/weather_summaries';
import { unmatchableId } from './shared';

/** How long a station's summaries stay warm after the detail page unmounts. */
const summariesGcTimeMs = 30_000;

/**
 * Bounds that admit every reading, for the caller that wants them all.
 *
 * A `date` column is fixed-width and zero-padded, so comparing it as a string is
 * comparing it as a date, and one pair of literals stands in for "no bound"
 * without a second query shape. Year zero does not exist in Postgres, so the
 * lower bound is year one.
 */
const EVERY_DAY = { from: '0001-01-01', to: '9999-12-31' } as const;

/**
 * Which year a reading belongs to: the one its bucket ends in.
 *
 * Read off the string rather than through a `Date`, for the reason in the module
 * comment. One end rather than both, because a bucket running from the 30th of
 * December to the 2nd of January has to land in one year or the card would list
 * it under two, and the card already orders by `end_date`.
 */
export function summaryYear(date: string): number {
	return Number(date.slice(0, 4));
}

export interface WeatherSummaryListing {
	readonly id: string;
	/** `YYYY-MM-DD`. Never a `Date`, see the module comment. */
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

export interface WeatherSummariesRead {
	readonly summaries: readonly WeatherSummaryListing[];
	readonly isReady: boolean;
	readonly isError: boolean;
}

/**
 * One year of a station's readings.
 *
 * `year` is `null` for a station that has none, and that matches nothing: an
 * empty card has no year to show, and reading a station's whole history to fill
 * one is what the bound exists to avoid.
 */
export function useWeatherSummaries(
	stationId: string | null,
	year: number | null,
): WeatherSummariesRead {
	return useStationSummaries(
		year === null ? null : stationId,
		year === null ? EVERY_DAY : { from: `${year}-01-01`, to: `${year}-12-31` },
	);
}

/**
 * Every reading a station holds.
 *
 * The import page's, and only the import page's. Its assessment answers insert,
 * update, no change or fail per parsed row against what the station already has,
 * so a bound narrower than the file would report an overwrite as an insert.
 */
export function useAllWeatherSummaries(stationId: string | null): WeatherSummariesRead {
	return useStationSummaries(stationId, EVERY_DAY);
}

/**
 * The years a station has readings in, newest first.
 *
 * Two columns rather than eleven, because this fills a row of tabs and nothing
 * on screen reads a metric off it. It is still the station's whole set: which
 * years have readings cannot be answered from one year's rows, and no server
 * read answers it. So the year bound above cuts what the card renders and what
 * its table live-queries, not what the shape carries.
 */
export function useWeatherSummaryYears(stationId: string | null): {
	readonly years: readonly number[];
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
					.select(({ summary }) => ({ id: summary.id, endDate: summary.end_date })),
		},
		[stationId],
	);

	// Newest first off the query already, so the first sighting of a year is its
	// place in the list and nothing is sorted here.
	const years: number[] = [];
	for (const row of result.data) {
		const year = summaryYear(row.endDate);
		if (!years.includes(year)) {
			years.push(year);
		}
	}

	return { years, isReady: result.isReady, isError: result.isError };
}

/** The read both hooks above are, with the window as the only difference. */
function useStationSummaries(
	stationId: string | null,
	window: { readonly from: string; readonly to: string },
): WeatherSummariesRead {
	const source = stationId ?? unmatchableId;
	const { from, to } = window;

	const result = useLiveQuery(
		{
			gcTime: summariesGcTimeMs,
			query: (query) =>
				query
					.from({ summary: weather_summaries() })
					.where(({ summary }) =>
						and(
							eq(summary.weather_source_id, source),
							gte(summary.end_date, from),
							lte(summary.end_date, to),
						),
					)
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
		[source, from, to],
	);

	return { summaries: result.data, isReady: result.isReady, isError: result.isError };
}

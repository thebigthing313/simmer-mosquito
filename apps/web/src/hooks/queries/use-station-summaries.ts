import { and, eq, gte, lte, useLiveQuery } from '@tanstack/react-db';
import { weather_summaries } from '../../lib/collections/weather_summaries';
import { unmatchableId } from './shared';
import { summariesGcTimeMs, type WeatherSummariesRead } from './weather-summary-view';
/** One station's readings inside a date window, newest first, gated on the on-demand subset being ready. */
export function useStationSummaries(
	stationId: string | null,
	window: { readonly from: string; readonly to: string },
): WeatherSummariesRead {
	const source = stationId ?? unmatchableId;
	const { from, to } = window;

	const result = useLiveQuery({
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
	});

	return { summaries: result.data, isReady: result.isReady, isError: result.isError };
}

import { useStationSummaries } from './use-station-summaries';
import { EVERY_DAY, type WeatherSummariesRead } from './weather-summary-view';

/**
 * One year of a station's readings, newest first. A `null` year matches
 * nothing.
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

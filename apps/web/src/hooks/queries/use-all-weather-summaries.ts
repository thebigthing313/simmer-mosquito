import { useStationSummaries } from './use-station-summaries';
import { EVERY_DAY, type WeatherSummariesRead } from './weather-summary-view';
/** Every reading a station holds, for the import page's assessment. */
export function useAllWeatherSummaries(stationId: string | null): WeatherSummariesRead {
	return useStationSummaries(stationId, EVERY_DAY);
}

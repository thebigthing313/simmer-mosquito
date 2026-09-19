import { eq, useLiveQuery } from '@tanstack/react-db';
import { weather_summaries } from '../../lib/collections/weather_summaries';
import { unmatchableId } from './shared';
import { summariesGcTimeMs, summaryYear } from './weather-summary-view';
/** The years a station has readings in, newest first. */
export function useWeatherSummaryYears(stationId: string | null): {
	readonly years: readonly number[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery({
		gcTime: summariesGcTimeMs,
		query: (query) =>
			query
				.from({ summary: weather_summaries() })
				.where(({ summary }) => eq(summary.weather_source_id, stationId ?? unmatchableId))
				.orderBy(({ summary }) => summary.end_date, 'desc')
				.select(({ summary }) => ({ id: summary.id, endDate: summary.end_date })),
	});

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

/** @vitest-environment jsdom */

/**
 * Weather's read: one station's summaries, newest first.
 *
 * No join. What this holds is the ordering and the dates: `start_date` and
 * `end_date` are Postgres `date` columns, and the row schema leaves them as
 * `YYYY-MM-DD` strings on purpose, because a `Date` built from a bare date
 * string is UTC midnight and renders as the day before west of Greenwich.
 * Fixed-width and zero-padded means lexicographic order is chronological order,
 * which is what the `desc` here relies on.
 *
 * It also holds the readiness signal, because this is the surface the
 * distinction was written for: a station with no summaries and a station whose
 * subset has not landed both read as an empty list.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
	useAllWeatherSummaries,
	useWeatherSummaries,
	useWeatherSummaryYears,
} from '../../../../hooks/queries/use-weather-summaries';
import { weather_summaries } from '../../../../lib/collections/weather_summaries';
import {
	installMemoryCollections,
	markSynced,
	seedRows,
} from '../../lib/collections/memory-collections';
import { renderRead } from './read-harness';

const STATION = '11111111-1111-4111-8111-111111111111';
const OTHER_STATION = '22222222-2222-4222-8222-222222222222';

function summary(id: string, endDate: string, sourceId = STATION) {
	return {
		id,
		weather_source_id: sourceId,
		start_date: endDate,
		end_date: endDate,
		temperature_min_f: 54,
		temperature_max_f: 92,
		precipitation_inches: 0,
		relative_humidity_min: 21,
		relative_humidity_max: 58,
		wind_speed_min_mph: 2,
		wind_speed_max_mph: 11,
	};
}

beforeEach(() => {
	installMemoryCollections();
});

describe('useAllWeatherSummaries', () => {
	it('reads the newest period first', async () => {
		seedRows(weather_summaries, [
			summary('w1', '2026-08-04'),
			summary('w2', '2026-08-19'),
			summary('w3', '2026-08-11'),
		]);

		const { result } = await renderRead(() => useAllWeatherSummaries(STATION));

		expect(result.current.summaries.map((row) => row.endDate)).toEqual([
			'2026-08-19',
			'2026-08-11',
			'2026-08-04',
		]);
	});

	it('keeps the dates as the strings the column holds', async () => {
		seedRows(weather_summaries, [summary('w1', '2026-08-04')]);

		const { result } = await renderRead(() => useAllWeatherSummaries(STATION));

		expect(result.current.summaries[0]?.endDate).toBe('2026-08-04');
	});

	it('answers about the station it was asked about', async () => {
		seedRows(weather_summaries, [
			summary('w1', '2026-08-04'),
			summary('w2', '2026-08-19', OTHER_STATION),
		]);

		const { result } = await renderRead(() => useAllWeatherSummaries(STATION));

		expect(result.current.summaries.map((row) => row.id)).toEqual(['w1']);
	});

	it('is empty and ready for a station with nothing recorded', async () => {
		markSynced(weather_summaries);

		const { result } = await renderRead(() => useAllWeatherSummaries(STATION));

		expect(result.current.summaries).toEqual([]);
		expect(result.current.isReady).toBe(true);
	});

	it('is empty and not ready before the subset lands', async () => {
		// The same array as above, and the opposite thing to draw. A page that reads
		// only `summaries` shows "no weather recorded" over a station that has some.
		installMemoryCollections({ ready: false });

		const { result } = await renderRead(() => useAllWeatherSummaries(STATION));

		expect(result.current.summaries).toEqual([]);
		expect(result.current.isReady).toBe(false);
	});
});

/**
 * The year bound, which is what keeps the detail card from rendering ten years
 * of daily readings into one table.
 *
 * The bound is on `end_date`, so a bucket that crosses new year is filed under
 * the year it ends in and appears once. Comparing `date` strings is comparing
 * dates, because the column is fixed-width and zero-padded.
 */
describe('useWeatherSummaries', () => {
	it('reads one year and leaves the rest', async () => {
		seedRows(weather_summaries, [
			summary('w1', '2024-08-04'),
			summary('w2', '2025-01-02'),
			summary('w3', '2025-12-31'),
			summary('w4', '2026-03-01'),
		]);

		const { result } = await renderRead(() => useWeatherSummaries(STATION, 2025));

		expect(result.current.summaries.map((row) => row.id)).toEqual(['w3', 'w2']);
	});

	it('files a bucket that crosses new year under the year it ends in', async () => {
		seedRows(weather_summaries, [{ ...summary('w1', '2026-01-02'), start_date: '2025-12-30' }]);

		const forEnding = await renderRead(() => useWeatherSummaries(STATION, 2026));
		expect(forEnding.result.current.summaries.map((row) => row.id)).toEqual(['w1']);

		const forStarting = await renderRead(() => useWeatherSummaries(STATION, 2025));
		expect(forStarting.result.current.summaries).toEqual([]);
	});

	it('reads nothing for a station with no year to show', async () => {
		seedRows(weather_summaries, [summary('w1', '2026-08-04')]);

		const { result } = await renderRead(() => useWeatherSummaries(STATION, null));

		expect(result.current.summaries).toEqual([]);
	});

	it('answers about the station it was asked about', async () => {
		seedRows(weather_summaries, [
			summary('w1', '2026-08-04'),
			summary('w2', '2026-08-19', OTHER_STATION),
		]);

		const { result } = await renderRead(() => useWeatherSummaries(STATION, 2026));

		expect(result.current.summaries.map((row) => row.id)).toEqual(['w1']);
	});
});

/** The tabs. One per year the station has readings in, newest first. */
describe('useWeatherSummaryYears', () => {
	it('names each year once, newest first', async () => {
		seedRows(weather_summaries, [
			summary('w1', '2024-08-04'),
			summary('w2', '2026-03-01'),
			summary('w3', '2024-09-09'),
			summary('w4', '2025-01-02'),
		]);

		const { result } = await renderRead(() => useWeatherSummaryYears(STATION));

		expect(result.current.years).toEqual([2026, 2025, 2024]);
	});

	it('is empty and ready for a station with nothing recorded', async () => {
		markSynced(weather_summaries);

		const { result } = await renderRead(() => useWeatherSummaryYears(STATION));

		expect(result.current.years).toEqual([]);
		expect(result.current.isReady).toBe(true);
	});

	it('counts only the station it was asked about', async () => {
		seedRows(weather_summaries, [
			summary('w1', '2026-08-04'),
			summary('w2', '2019-08-19', OTHER_STATION),
		]);

		const { result } = await renderRead(() => useWeatherSummaryYears(STATION));

		expect(result.current.years).toEqual([2026]);
	});
});

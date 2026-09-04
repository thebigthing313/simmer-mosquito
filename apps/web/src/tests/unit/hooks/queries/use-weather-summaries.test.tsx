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
import { useWeatherSummaries } from '../../../../hooks/queries/use-weather-summaries';
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

describe('useWeatherSummaries', () => {
	it('reads the newest period first', async () => {
		seedRows(weather_summaries, [
			summary('w1', '2026-08-04'),
			summary('w2', '2026-08-19'),
			summary('w3', '2026-08-11'),
		]);

		const { result } = await renderRead(() => useWeatherSummaries(STATION));

		expect(result.current.summaries.map((row) => row.endDate)).toEqual([
			'2026-08-19',
			'2026-08-11',
			'2026-08-04',
		]);
	});

	it('keeps the dates as the strings the column holds', async () => {
		seedRows(weather_summaries, [summary('w1', '2026-08-04')]);

		const { result } = await renderRead(() => useWeatherSummaries(STATION));

		expect(result.current.summaries[0]?.endDate).toBe('2026-08-04');
	});

	it('answers about the station it was asked about', async () => {
		seedRows(weather_summaries, [
			summary('w1', '2026-08-04'),
			summary('w2', '2026-08-19', OTHER_STATION),
		]);

		const { result } = await renderRead(() => useWeatherSummaries(STATION));

		expect(result.current.summaries.map((row) => row.id)).toEqual(['w1']);
	});

	it('is empty and ready for a station with nothing recorded', async () => {
		markSynced(weather_summaries);

		const { result } = await renderRead(() => useWeatherSummaries(STATION));

		expect(result.current.summaries).toEqual([]);
		expect(result.current.isReady).toBe(true);
	});

	it('is empty and not ready before the subset lands', async () => {
		// The same array as above, and the opposite thing to draw. A page that reads
		// only `summaries` shows "no weather recorded" over a station that has some.
		installMemoryCollections({ ready: false });

		const { result } = await renderRead(() => useWeatherSummaries(STATION));

		expect(result.current.summaries).toEqual([]);
		expect(result.current.isReady).toBe(false);
	});
});

/**
 * Which commands a weather station edit is.
 *
 * One form, two commands: renaming a station and moving it are different things
 * to have done, and each carries a different confirmation, because each rewrites
 * a different part of what its past readings mean. Summaries record neither the
 * station's name nor its position, so a rename relabels every reading ever taken
 * there and a move relocates all of them.
 *
 * The point is the one worth being careful about. It does not travel as a column
 * `geom` never syncs and `lat`/`lng` are generated, so nothing about the row
 * can betray a move that was not sent, or a re-send of the point the station
 * already had. The only signal is whether the caller passed one, which is why
 * `geometry: null` has to mean "not touched" rather than "cleared".
 */

import type { GeoJsonPoint } from '@simmer-mosquito/mapping';
import { describe, expect, it } from 'vitest';
import {
	stationUpdatePlan,
	type WeatherStationFields,
} from '../../../../hooks/mutations/use-weather-station-mutations';

const PIN: GeoJsonPoint = { type: 'Point', coordinates: [-121.49, 38.58] };

const CURRENT: WeatherStationFields = { name: 'North Gauge', code: 'NG-1', metadata: null };

function plan(
	fields: Partial<WeatherStationFields>,
	geometry: GeoJsonPoint | null = null,
	acknowledged: { readonly identity?: boolean; readonly location?: boolean } = {},
) {
	return stationUpdatePlan({
		fields: { ...CURRENT, ...fields },
		current: CURRENT,
		geometry,
		acknowledgedIdentityChange: acknowledged.identity ?? false,
		acknowledgedLocationChange: acknowledged.location ?? false,
	});
}

describe('weather station update plan', () => {
	it('is nothing at all when nothing moved', () => {
		// An untouched save is not a write. Naming a command anyway would be refused
		// by the domain for having nothing to change, which reads to the user as a
		// broken Save rather than as a no-op.
		expect(plan({})).toBeNull();
	});

	it('names the details command for a rename', () => {
		const result = plan({ name: 'South Gauge' });

		expect(result?.intents).toEqual(['weather.updateWeatherStationDetails']);
		expect(result?.changes).toMatchObject({ source_name: 'South Gauge', source_code: 'NG-1' });
	});

	it('names the details command for a code change alone', () => {
		const result = plan({ code: 'NG-2' });

		expect(result?.intents).toEqual(['weather.updateWeatherStationDetails']);
		expect(result?.changes).toMatchObject({ source_code: 'NG-2' });
	});

	// Clearing a code is a change to it, and the column is unique per agency where
	// it is non-null, so present-and-null has to be told apart from absent, the
	// same distinction the region's folder id turns on.
	it('treats clearing the code as a change', () => {
		const result = plan({ code: null });

		expect(result?.intents).toEqual(['weather.updateWeatherStationDetails']);
		expect(result?.changes).toMatchObject({ source_code: null });
	});

	it('names the location command only when a point was passed', () => {
		expect(plan({}, PIN)?.intents).toEqual(['weather.updateWeatherStationLocation']);
		// The form holds the point it loaded. Passing that back would be a command
		// with nothing to change, so the caller passes null and this stays quiet.
		expect(plan({})).toBeNull();
	});

	it('writes the centroid columns for the map to place the pin before the server answers', () => {
		const result = plan({}, PIN);

		expect(result?.changes).toMatchObject({ lat: 38.58, lng: -121.49, geom_type: 'st_point' });
		// The point itself rides as an argument, because there is no column for it.
		expect(result?.arguments).toMatchObject({ geometry: PIN });
	});

	it('names both commands when a station is renamed and moved in one save', () => {
		const result = plan({ name: 'South Gauge' }, PIN);

		expect(result?.intents).toEqual([
			'weather.updateWeatherStationDetails',
			'weather.updateWeatherStationLocation',
		]);
	});

	// The two acknowledgements are separate questions and each belongs to its own
	// command: agreeing to relabel the history is not agreeing to move it.
	it('carries each acknowledgement only with the command it answers', () => {
		const renamed = plan({ name: 'South Gauge' }, null, { identity: true });
		const moved = plan({}, PIN, { location: true });

		expect(renamed?.acknowledgements).toEqual({
			acknowledgedHistoricalStationIdentityChange: true,
		});
		expect(moved?.acknowledgements).toEqual({ acknowledgedHistoricalLocationChange: true });
	});

	// The transport folds arguments in before deciding whether a patch is empty
	// and does not fold acknowledgements in. So an answer to a question must never
	// be the only thing a write carries, otherwise agreeing to something would
	// send a write with nothing in it.
	it('keeps the acknowledgements out of the arguments', () => {
		const result = plan({ name: 'South Gauge' }, PIN, { identity: true, location: true });

		expect(Object.keys(result?.arguments ?? {})).toEqual(['geometry']);
	});
});

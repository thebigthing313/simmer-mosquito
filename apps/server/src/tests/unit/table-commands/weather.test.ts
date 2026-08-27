/**
 * The weather tables, as translations.
 *
 * These builders are where Postgres column names become domain arguments, and
 * three of those translations carry a rule rather than a rename: which of
 * `is_active`'s two directions a write means, what an absent metric key means
 * against a present-but-null one, and which calendar day counts as today.
 *
 * The last is the one with a wrong answer that looks right. A summary records
 * weather that already happened, so its bucket cannot end after today, and
 * "today" is the agency's calendar day, not the server's. Checked against UTC, a
 * California agency entering the afternoon's rain at 5pm local is submitting
 * tomorrow, and gets refused for a date it is standing in.
 */

import { DomainValidationError } from '@simmer-mosquito/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthContext } from '../../../auth-context.js';
import type { AgencyCommandType } from '../../../command-permissions.js';
import type { WritableCommand } from '../../../command-write.js';
import type { IntentRequest, TableCommands } from '../../../table-commands/dispatch.js';
import {
	weatherStationTableCommands,
	weatherSummaryTableCommands,
} from '../../../table-commands/weather.js';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const ACTOR = '22222222-2222-4222-8222-222222222222';
const ROW = '33333333-3333-4333-8333-333333333333';
const STATION = '44444444-4444-4444-8444-444444444444';

const PIN = { type: 'Point', coordinates: [-121.49, 38.58] };

function request(payload: Record<string, unknown>, timeZone = 'America/New_York'): IntentRequest {
	return {
		payload,
		agency: { organizationId: ORGANIZATION, actorProfileId: ACTOR },
		authContext: {
			organization: { id: ORGANIZATION, settings: null },
			profile: { id: ACTOR },
			role: 'manager',
			timeZone,
		} as unknown as AuthContext,
		id: ROW,
	};
}

function build<TCommand extends WritableCommand>(
	spec: TableCommands<TCommand, unknown>,
	intent: AgencyCommandType,
	intentRequest: IntentRequest,
): TCommand {
	const builder = spec.intents[intent];
	if (builder === undefined) {
		throw new Error(`${spec.table} does not accept ${intent}.`);
	}
	return builder(intentRequest);
}

const stations = weatherStationTableCommands(undefined as never);
const summaries = weatherSummaryTableCommands(undefined as never);

/** A day far enough back that no timezone this test uses can call it the future. */
const PAST_DAY = '2020-06-15';

describe('weather stations', () => {
	it('reads a station off column names', () => {
		const command = build(
			stations,
			'weather.createWeatherStation',
			request({ source_name: '  North Gauge  ', source_code: 'NG-1', geometry: PIN }),
		);

		expect(command.payload).toMatchObject({
			organizationId: ORGANIZATION,
			actorProfileId: ACTOR,
			weatherStationId: ROW,
			// Trimmed by the domain, not here.
			stationName: 'North Gauge',
			stationCode: 'NG-1',
			geometry: PIN,
		});
	});

	it('leaves an absent code null rather than empty', () => {
		const command = build(
			stations,
			'weather.createWeatherStation',
			request({ source_name: 'North Gauge', source_code: '   ', geometry: PIN }),
		);

		// The column is unique per agency where it is non-null, so a station saved
		// with a blank code field must not claim the empty string, the second one
		// saved that way would collide with the first.
		expect(command.payload).toMatchObject({ stationCode: null });
	});

	// Absent means confirmed, across the whole `/commands` surface. What a client
	// withholding one looks like is an explicit `false`.
	it('carries a withheld identity acknowledgement through', () => {
		const withheld = build(
			stations,
			'weather.updateWeatherStationDetails',
			request({ source_name: 'Renamed', acknowledgedHistoricalStationIdentityChange: false }),
		);
		const silent = build(
			stations,
			'weather.updateWeatherStationDetails',
			request({ source_name: 'Renamed' }),
		);

		expect(withheld.payload).toMatchObject({
			acknowledgedHistoricalStationIdentityChange: false,
		});
		expect(silent.payload).toMatchObject({
			acknowledgedHistoricalStationIdentityChange: true,
		});
	});

	// `is_active` is a column a client can see on the row, so the two directions
	// have to be separate names rather than a details edit carrying the column.
	// Otherwise nothing distinguishes retiring a station from reviving one.
	it('takes deactivate and reactivate as separate names', () => {
		const off = build(stations, 'weather.deactivateWeatherStation', request({}));
		const on = build(stations, 'weather.reactivateWeatherStation', request({}));

		expect(off.type).toBe('weather.deactivateWeatherStation');
		expect(on.type).toBe('weather.reactivateWeatherStation');
	});

	it('reads expectedUpdatedAt as an instant, and its absence as null', () => {
		const stamped = build(
			stations,
			'weather.deleteWeatherStation',
			request({ expectedUpdatedAt: '2026-08-19T14:00:00.000Z' }),
		);
		const unstamped = build(stations, 'weather.deleteWeatherStation', request({}));

		expect(stamped.payload).toMatchObject({
			expectedUpdatedAt: new Date('2026-08-19T14:00:00.000Z'),
		});
		// Absent is last-write-wins, which is what a form that never loaded a
		// version can honestly promise.
		expect(unstamped.payload).toMatchObject({ expectedUpdatedAt: null });
	});
});

describe('weather summaries', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('reads a bucket and its metrics off column names', () => {
		const command = build(
			summaries,
			'weather.createWeatherSummary',
			request({
				weather_source_id: STATION,
				start_date: PAST_DAY,
				end_date: '2020-06-17',
				precipitation_inches: 1.25,
				temperature_min_f: 54,
				temperature_max_f: 78.5,
			}),
		);

		expect(command.payload).toMatchObject({
			weatherSummaryId: ROW,
			weatherStationId: STATION,
			startDate: PAST_DAY,
			endDate: '2020-06-17',
			precipitationInches: 1.25,
			temperatureMinF: 54,
			temperatureMaxF: 78.5,
			// A metric the row does not carry is null, not absent: a create states
			// the whole reading.
			windSpeedMinMph: null,
		});
	});

	// A same-day bucket stores `end_date = start_date`, and the domain never emits
	// a null end. A client that names one day should not have to say it twice.
	it('treats a bucket with no end as a single day', () => {
		const command = build(
			summaries,
			'weather.createWeatherSummary',
			request({ weather_source_id: STATION, start_date: PAST_DAY, precipitation_inches: 0.1 }),
		);

		expect(command.payload).toMatchObject({ startDate: PAST_DAY, endDate: PAST_DAY });
	});

	// The distinction the whole patch rests on: an absent key leaves the stored
	// reading alone, and an explicit null clears it. Collapsing the two would make
	// every edit a full-row replacement without saying so.
	it('tells an absent metric apart from a cleared one', () => {
		const command = build(
			summaries,
			'weather.updateWeatherSummary',
			request({ precipitation_inches: null, temperature_max_f: 81 }),
		);

		expect(changesOf(command)).toEqual({
			precipitationInches: null,
			temperatureMaxF: 81,
		});
	});

	it('reads a numeric string from a form as a reading', () => {
		const command = build(
			summaries,
			'weather.updateWeatherSummary',
			request({ precipitation_inches: '1.25' }),
		);

		expect(changesOf(command)).toEqual({ precipitationInches: 1.25 });
	});

	it('refuses a bucket that ends after today in the agency zone', () => {
		const tomorrow = daysFromNow(2);

		expect(() =>
			build(
				summaries,
				'weather.createWeatherSummary',
				request({
					weather_source_id: STATION,
					start_date: PAST_DAY,
					end_date: tomorrow,
					precipitation_inches: 1,
				}),
			),
		).toThrow(DomainValidationError);
	});

	/**
	 * The zone has to be the agency's, and this is what proves it is not the
	 * server's.
	 *
	 * At 06:00 UTC the calendar has already turned in Auckland and has not yet
	 * turned in Los Angeles, so one and the same date is today for one agency and
	 * tomorrow for the other. A check against UTC, or against whichever zone the
	 * test machine happens to sit in, cannot tell those two apart, and would pass
	 * this on some machines and fail it on others.
	 */
	it('reads today from the agency zone rather than the server clock', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2026-06-15T06:00:00.000Z'));

		const auckland = () =>
			build(
				summaries,
				'weather.createWeatherSummary',
				request(
					{
						weather_source_id: STATION,
						start_date: '2026-06-15',
						end_date: '2026-06-15',
						precipitation_inches: 1,
					},
					'Pacific/Auckland',
				),
			);
		const losAngeles = () =>
			build(
				summaries,
				'weather.createWeatherSummary',
				request(
					{
						weather_source_id: STATION,
						start_date: '2026-06-15',
						end_date: '2026-06-15',
						precipitation_inches: 1,
					},
					'America/Los_Angeles',
				),
			);

		// 2026-06-15 has already begun in Auckland and has not begun in
		// Los Angeles.
		expect(auckland).not.toThrow();
		expect(losAngeles).toThrow(DomainValidationError);
	});
});

/**
 * The `changes` of a patch command, read off a union that also holds payloads
 * without one.
 *
 * `build` is generic over the whole `WeatherCommand` union, a create and an
 * import are the same type as far as it is concerned, so reading `changes`
 * needs the narrowing that the test's own `it` title already implies.
 */
function changesOf(command: WritableCommand): Record<string, unknown> {
	return (command.payload as { readonly changes?: Record<string, unknown> }).changes ?? {};
}

/** A `YYYY-MM-DD` string some days from now, in UTC, which is far enough for these. */
function daysFromNow(days: number): string {
	const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
	return date.toISOString().slice(0, 10);
}

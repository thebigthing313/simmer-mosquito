/** @vitest-environment jsdom */

/**
 * What a weather write dispatches: the stations an agency reads at, and the
 * summaries recorded against them.
 *
 * Two things here are unlike the rest of the app. The station's point is an
 * argument rather than a location source, because the point is the record. And
 * both tables allow a null `organization_id`, for the provider feed no command
 * writes, so the row an agency create builds has to name the Agency itself;
 * nothing downstream would object to a null, it would just be a station nobody
 * owns.
 *
 * The acknowledgements are the other half. `acknowledged()` on the server reads
 * an absent flag as confirmed, so a form that forgets one passes every guard and
 * the write succeeds. Weather is the surface that asks, so the first attempt has
 * to carry `false` and find out.
 *
 * `stationUpdatePlan` is tested as a pure function beside this file. This covers
 * the lines that hand a plan to `mutateCollection`, plus the four operations
 * that build no plan at all.
 */

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';
const RECORD = '33333333-3333-4333-8333-333333333333';
const STATION = '44444444-4444-4444-8444-444444444444';

vi.mock('../../../../lib/collections/mutate', async () => {
	const { recordDispatch } = await import('./dispatch-harness');
	return { mutateCollection: recordDispatch };
});
vi.mock('../../../../lib/collections/weather_sources', async () => {
	const { stubCollection } = await import('./dispatch-harness');
	return { weather_sources: stubCollection('weather_sources') };
});
vi.mock('../../../../lib/collections/weather_summaries', async () => {
	const { stubCollection } = await import('./dispatch-harness');
	return { weather_summaries: stubCollection('weather_summaries') };
});
vi.mock('../../../../hooks/use-auth-snapshot', () => ({
	useAuthSnapshot: () => ({
		authenticated: true,
		localIdentity: { organizationId: ORGANIZATION, profileId: PROFILE },
	}),
}));

const {
	dispatches,
	firstAttempt,
	lastChanges,
	lastIntents,
	lastRow,
	lastWrite,
	resetDispatches,
	stubApi,
} = await import('./dispatch-harness');
const { STATION_DELETE_REFUSALS, STATION_REFUSALS } = await import(
	'../../../../lib/acknowledgement-copy'
);
const { useWeatherStationMutations } = await import(
	'../../../../hooks/mutations/use-weather-station-mutations'
);
const { useWeatherSummaryMutations } = await import(
	'../../../../hooks/mutations/use-weather-summary-mutations'
);

const PIN = { type: 'Point', coordinates: [-121.49, 38.58] } as const;

beforeEach(() => {
	resetDispatches();
	stubApi();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function stationFields(overrides: Record<string, unknown> = {}) {
	return {
		name: 'North Gauge',
		code: 'NG-1',
		metadata: null,
		...overrides,
	} as never;
}

describe('a weather station write', () => {
	it('names the create and carries the point as an argument, not a location source', async () => {
		const { result } = renderHook(() => useWeatherStationMutations());

		await result.current.create(RECORD, stationFields(), PIN as never);

		expect(lastIntents()).toEqual(['weather.createWeatherStation']);
		expect(lastWrite().arguments).toEqual({ geometry: PIN, metadata: null });
		expect(lastWrite().locationSource).toBeUndefined();
	});

	it("builds the new station as the acting agency's own, not as an unowned feed", async () => {
		// `organization_id` is nullable on this table for the provider rows, so a
		// missing Agency here is a station that syncs to nobody rather than an
		// error, and `source_type` is what the server will set regardless.
		const { result } = renderHook(() => useWeatherStationMutations());

		await result.current.create(RECORD, stationFields(), PIN as never);

		expect(lastRow().organization_id).toBe(ORGANIZATION);
		expect(lastRow().source_type).toBe('organization');
		expect(lastRow().is_active).toBe(true);
		expect(lastRow().geom_type).toBe('st_point');
	});

	it('names only the details command when the pin did not move', async () => {
		const { result } = renderHook(() => useWeatherStationMutations());

		await result.current.save({
			weatherStationId: RECORD,
			fields: stationFields({ name: 'South Gauge' }),
			current: stationFields(),
			geometry: null,
			acknowledgedIdentityChange: true,
			acknowledgedLocationChange: true,
		});

		expect(lastIntents()).toEqual(['weather.updateWeatherStationDetails']);
		expect(lastWrite().arguments).toEqual({});
		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedHistoricalStationIdentityChange: true,
		});
	});

	it('asks nothing of a notes-only edit, because no reading is relabelled', async () => {
		const { result } = renderHook(() => useWeatherStationMutations());

		await result.current.save({
			weatherStationId: RECORD,
			fields: stationFields({ metadata: { shelter: 'louvred' } }),
			current: stationFields(),
			geometry: null,
			acknowledgedIdentityChange: false,
			acknowledgedLocationChange: false,
		});

		expect(lastIntents()).toEqual(['weather.updateWeatherStationDetails']);
		expect(lastWrite().acknowledgements).toEqual({});
	});

	it('carries the moved pin and moves the centroid with it', async () => {
		const { result } = renderHook(() => useWeatherStationMutations());

		await result.current.save({
			weatherStationId: RECORD,
			fields: stationFields(),
			current: stationFields(),
			geometry: PIN as never,
			acknowledgedIdentityChange: false,
			acknowledgedLocationChange: true,
		});

		expect(lastIntents()).toEqual(['weather.updateWeatherStationLocation']);
		expect(lastWrite().arguments).toEqual({ geometry: PIN });
		expect(lastChanges().geom_type).toBe('st_point');
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedHistoricalLocationChange: true });
	});

	it('names both commands when the identity and the pin both moved', async () => {
		const { result } = renderHook(() => useWeatherStationMutations());

		await result.current.save({
			weatherStationId: RECORD,
			fields: stationFields({ code: 'NG-2' }),
			current: stationFields(),
			geometry: PIN as never,
			acknowledgedIdentityChange: true,
			acknowledgedLocationChange: true,
		});

		expect(dispatches()).toHaveLength(1);
		expect(lastIntents()).toEqual([
			'weather.updateWeatherStationDetails',
			'weather.updateWeatherStationLocation',
		]);
	});

	it('dispatches nothing when the form was saved untouched', async () => {
		// An acknowledgement is not folded into the "did anything change" check, so
		// answering a refusal cannot on its own turn an untouched form into a write.
		const { result } = renderHook(() => useWeatherStationMutations());

		await result.current.save({
			weatherStationId: RECORD,
			fields: stationFields(),
			current: stationFields(),
			geometry: null,
			acknowledgedIdentityChange: true,
			acknowledgedLocationChange: true,
		});

		expect(dispatches()).toHaveLength(0);
	});

	it('sends both history flags as false on the first attempt', async () => {
		// historyCheck. Summaries record neither what the station was called nor
		// where it stood, so a rename relabels every past reading and a move
		// relocates them. Moved here from `acknowledged-write.test.tsx`.
		const { result } = renderHook(() => useWeatherStationMutations());

		await firstAttempt(STATION_REFUSALS, (acknowledgements) =>
			result.current.save({
				weatherStationId: RECORD,
				fields: stationFields({ name: 'South Gauge', code: 'SG-1' }),
				current: stationFields(),
				geometry: PIN as never,
				acknowledgedIdentityChange:
					acknowledgements.acknowledgedHistoricalStationIdentityChange === true,
				acknowledgedLocationChange: acknowledgements.acknowledgedHistoricalLocationChange === true,
			}),
		);

		expect(lastIntents()).toEqual([
			'weather.updateWeatherStationDetails',
			'weather.updateWeatherStationLocation',
		]);
		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedHistoricalStationIdentityChange: false,
			acknowledgedHistoricalLocationChange: false,
		});
	});

	it('reads the service switch for its direction', async () => {
		// `is_active` is a column the client can see, so the direction has to be
		// said rather than read back off the value.
		const { result } = renderHook(() => useWeatherStationMutations());

		await result.current.setActive(RECORD, false);
		expect(lastIntents()).toEqual(['weather.deactivateWeatherStation']);
		expect(lastChanges().is_active).toBe(false);

		await result.current.setActive(RECORD, true);
		expect(lastIntents()).toEqual(['weather.reactivateWeatherStation']);
		expect(lastChanges().is_active).toBe(true);
	});

	it('sends the summary flag as false on the first attempt', async () => {
		// clearanceCheck. The only weather write that destroys data. Moved here from
		// `acknowledged-write.test.tsx`.
		const { result } = renderHook(() => useWeatherStationMutations());

		await firstAttempt(STATION_DELETE_REFUSALS, (acknowledgements) =>
			result.current.remove(RECORD, acknowledgements.acknowledgedSummaryDeletion === true),
		);

		expect(lastIntents()).toEqual(['weather.deleteWeatherStation']);
		expect(lastWrite().acknowledgements).toEqual({ acknowledgedSummaryDeletion: false });
	});
});

function summaryFields(overrides: Record<string, unknown> = {}) {
	return {
		startDate: '2026-08-03',
		endDate: '2026-08-05',
		temperatureMinF: 58,
		temperatureMaxF: 91,
		precipitationInches: null,
		relativeHumidityMin: null,
		relativeHumidityMax: null,
		windSpeedMinMph: null,
		windSpeedMaxMph: null,
		...overrides,
	} as never;
}

describe('a weather summary write', () => {
	it('names the create and files the bucket under its station and agency', async () => {
		const { result } = renderHook(() => useWeatherSummaryMutations());

		await result.current.create({
			weatherSummaryId: RECORD,
			weatherStationId: STATION,
			fields: summaryFields(),
		});

		expect(lastIntents()).toEqual(['weather.createWeatherSummary']);
		expect(lastRow().weather_source_id).toBe(STATION);
		expect(lastRow().organization_id).toBe(ORGANIZATION);
	});

	it('keeps the bucket dates as the strings the columns hold', async () => {
		// A `Date` built from a bare date string is midnight UTC, so west of
		// Greenwich a bucket entered on the 3rd would be sent as the 2nd.
		const { result } = renderHook(() => useWeatherSummaryMutations());

		await result.current.create({
			weatherSummaryId: RECORD,
			weatherStationId: STATION,
			fields: summaryFields(),
		});

		expect(lastRow().start_date).toBe('2026-08-03');
		expect(lastRow().end_date).toBe('2026-08-05');
	});

	it('states every metric on a correction, so an emptied box clears the reading', async () => {
		// The update has patch semantics per metric: a number sets it, an explicit
		// null clears it, and an absent key leaves the stored reading alone. The
		// form holds all seven, so all seven travel.
		const { result } = renderHook(() => useWeatherSummaryMutations());

		await result.current.save({
			weatherSummaryId: RECORD,
			fields: summaryFields({ temperatureMaxF: 88, temperatureMinF: null }),
		});

		expect(lastIntents()).toEqual(['weather.updateWeatherSummary']);
		expect(lastChanges().temperature_max_f).toBe(88);
		expect(Object.keys(lastChanges())).toContain('temperature_min_f');
		expect(lastChanges().temperature_min_f).toBeNull();
		expect(Object.keys(lastChanges())).toContain('wind_speed_max_mph');
	});

	it('names the delete', async () => {
		const { result } = renderHook(() => useWeatherSummaryMutations());

		await result.current.remove(RECORD);

		expect(lastIntents()).toEqual(['weather.deleteWeatherSummary']);
		expect(lastWrite().operation).toBe('delete');
	});
});

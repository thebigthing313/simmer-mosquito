/** @vitest-environment jsdom */

/**
 * That the flags actually reach the wire, per surface.
 *
 * `acknowledged()` on the server reads an absent flag as confirmed, so a guard
 * fires only for a client that sends `false` on purpose. That reading is staying
 * (#319): flipping it would refuse writes from mobile and from every script that
 * works today. The cost is that a form which forgets to send its flags passes
 * every guard and nobody finds out, because the write succeeds.
 *
 * So this is the test each converted surface owes. It asserts the payload of the
 * *first* attempt, before any dialog, and it is the only thing standing between
 * a surface that asks and a surface that silently does not.
 */

import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const mutateCollection = vi.fn((_collection: unknown, _write: unknown) => ({
	isPersisted: { promise: Promise.resolve() },
}));
vi.mock('../../../lib/collections/mutate', () => ({
	mutateCollection: (collection: unknown, write: unknown) => mutateCollection(collection, write),
}));
vi.mock('../../../lib/collections/habitats', () => ({ habitats: {} }));
vi.mock('../../../lib/collections/weather_sources', () => ({ weather_sources: {} }));
vi.mock('../../../hooks/use-auth-snapshot', () => ({
	useAuthSnapshot: () => ({
		authenticated: true,
		localIdentity: { organizationId: ORGANIZATION, profileId: PROFILE },
	}),
}));

const ORGANIZATION = '11111111-1111-4111-8111-111111111111';
const PROFILE = '22222222-2222-4222-8222-222222222222';
const RECORD = '33333333-3333-4333-8333-333333333333';

const { useAcknowledgedWrite } = await import('../../../components/acknowledged-write');
const {
	HABITAT_DELETE_REFUSALS,
	STATION_DELETE_REFUSALS,
	STATION_REFUSALS,
	acknowledgementCopyFor,
} = await import('../../../lib/acknowledgement-copy');
const { useHabitatMutations } = await import('../../../hooks/mutations/use-habitat-mutations');
const { useWeatherStationMutations } = await import(
	'../../../hooks/mutations/use-weather-station-mutations'
);

/** What `mutateCollection` was handed, from the most recent call. */
function lastWrite(): Record<string, unknown> {
	const call = mutateCollection.mock.calls.at(-1);
	expect(call).toBeDefined();
	return (call as [unknown, unknown])[1] as Record<string, unknown>;
}

describe('the habitat delete asks the registry', () => {
	// deleteRegistry. Deleting a habitat keeps its inspections and the control
	// work recorded against it, and clears the link to the habitat from both. The
	// registry counts those rows and refuses; withholding the flags is what makes
	// it count them at all.
	it('sends both detach flags as false on the first attempt', async () => {
		mutateCollection.mockClear();
		const { result } = renderHook(() => ({
			ask: useAcknowledgedWrite({ askable: HABITAT_DELETE_REFUSALS, ask: true }),
			mutations: useHabitatMutations(),
		}));

		await result.current.ask.run((acknowledgements) =>
			result.current.mutations.remove(RECORD, acknowledgements),
		);

		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedInspectionDetach: false,
			acknowledgedCrossDomainDetach: false,
		});
	});
});

describe('the weather station edit asks about the readings', () => {
	// historyCheck. Summaries record neither what the station was called nor where
	// it stood, so a rename relabels every past reading and a move relocates them.
	it('sends both history flags as false on the first attempt', async () => {
		mutateCollection.mockClear();
		const { result } = renderHook(() => ({
			ask: useAcknowledgedWrite({ askable: STATION_REFUSALS, ask: true }),
			mutations: useWeatherStationMutations(),
		}));

		await result.current.ask.run((acknowledgements) =>
			result.current.mutations.save({
				weatherStationId: RECORD,
				fields: { name: 'South Gauge', code: 'SG-1', metadata: null },
				current: { name: 'North Gauge', code: 'NG-1', metadata: null },
				geometry: { type: 'Point', coordinates: [-121.49, 38.58] },
				acknowledgedIdentityChange:
					acknowledgements.acknowledgedHistoricalStationIdentityChange === true,
				acknowledgedLocationChange: acknowledgements.acknowledgedHistoricalLocationChange === true,
			}),
		);

		expect(lastWrite().acknowledgements).toEqual({
			acknowledgedHistoricalStationIdentityChange: false,
			acknowledgedHistoricalLocationChange: false,
		});
	});
});

describe('the weather station delete asks about the readings it destroys', () => {
	// clearanceCheck. The only weather write that destroys data.
	it('sends the summary flag as false on the first attempt', async () => {
		mutateCollection.mockClear();
		const { result } = renderHook(() => ({
			ask: useAcknowledgedWrite({ askable: STATION_DELETE_REFUSALS, ask: true }),
			mutations: useWeatherStationMutations(),
		}));

		await result.current.ask.run((acknowledgements) =>
			result.current.mutations.remove(
				RECORD,
				acknowledgements.acknowledgedSummaryDeletion === true,
			),
		);

		expect(lastWrite().acknowledgements).toEqual({ acknowledgedSummaryDeletion: false });
	});
});

describe('opting in', () => {
	// The surfaces that have not been converted keep the behaviour that shipped:
	// no flags, every guard confirmed. Losing this would turn on forty-five
	// questions at once across pages with no wording for any of them.
	it('sends nothing at all without ask', async () => {
		const write = vi.fn(async () => undefined);
		const { result } = renderHook(() => useAcknowledgedWrite({ askable: STATION_REFUSALS }));

		await result.current.run(write);

		expect(write).toHaveBeenCalledWith({});
	});
});

describe('a refusal with no copy', () => {
	/**
	 * The counts are the server's and they are true whether or not anybody wrote a
	 * sentence around them, so the question states them and the save goes through
	 * on confirm. Dead-ending the user over a missing string in this repo would be
	 * the worse failure.
	 */
	it('builds a sentence from the consequences and logs the flag', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		const copy = acknowledgementCopyFor('acknowledgedNothingWrittenYet', [
			{ key: 'inspections', count: 4, singular: 'inspection', plural: 'inspections' },
			{ key: 'samples', count: 1, singular: 'sample', plural: 'samples' },
		]);

		expect(copy.body).toBe('This affects 4 inspections and 1 sample.');
		expect(warn).toHaveBeenCalledWith(expect.stringContaining('acknowledgedNothingWrittenYet'));
		warn.mockRestore();
	});

	it('still says something when the refusal counts nothing', () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

		expect(acknowledgementCopyFor('acknowledgedNothingWrittenYet', []).body).toBe(
			'This changes records beyond the one on screen.',
		);
		warn.mockRestore();
	});

	it('prefers the written question when there is one', () => {
		expect(acknowledgementCopyFor('acknowledgedSummaryDeletion', []).confirm).toBe('Delete them');
	});
});

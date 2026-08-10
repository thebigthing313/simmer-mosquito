import type { ServiceRequestRow } from '@simmer-mosquito/sync';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createServiceRequestMutationHandlers } from '../../../sync/publicEngagementMutations';

/**
 * Closing or reopening a request records a comment server-side, and its text is
 * the operator's. That text is not a column on the row, so it cannot travel
 * through the diff — it rides as mutation metadata, and this handler is the one
 * place that turns it into a field the endpoint reads.
 *
 * The failure worth pinning is silent in both directions: a reason dropped here
 * leaves the close working and the comment reading "Closed", and a reason
 * attached to the wrong write turns an ordinary edit into a PATCH the server
 * would answer 400 to.
 */
describe('service request lifecycle reasons', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('sends a resolution summary with the close that carries it', async () => {
		const fetch = stubFetch();

		await createServiceRequestMutationHandlers({ serverUrl: SERVER }).onUpdate({
			transaction: {
				mutations: [
					{
						original: request(),
						modified: request({ closedAt: '2026-08-10T17:00:00.000Z' }),
						metadata: { resolutionSummary: 'No standing water found on site.' },
					},
				],
			},
		});

		expect(bodyOf(fetch)).toEqual({
			closedAt: '2026-08-10T17:00:00.000Z',
			resolutionSummary: 'No standing water found on site.',
		});
	});

	it('sends a reopen reason under its own name, not the close’s', async () => {
		// Two names for one box on screen, because they reach two different commands.
		// Sent under the wrong one, the server reads no reason and falls back to its
		// own wording, which looks exactly like the operator having typed nothing.
		const fetch = stubFetch();

		await createServiceRequestMutationHandlers({ serverUrl: SERVER }).onUpdate({
			transaction: {
				mutations: [
					{
						original: request({ closedAt: '2026-08-09T12:00:00.000Z' }),
						modified: request({ closedAt: null }),
						metadata: { reopenReason: 'Caller reported it again.' },
					},
				],
			},
		});

		expect(bodyOf(fetch)).toEqual({
			closedAt: null,
			reopenReason: 'Caller reported it again.',
		});
	});

	it('leaves an ordinary edit alone even when a stale reason is attached', async () => {
		// `closedAt` did not change, so there is no close for a reason to belong to.
		// Adding the key anyway would send a field the endpoint reads as a lifecycle
		// command it was never asked for.
		const fetch = stubFetch();

		await createServiceRequestMutationHandlers({ serverUrl: SERVER }).onUpdate({
			transaction: {
				mutations: [
					{
						original: request(),
						modified: request({ details: 'Mosquitoes out back, worse at dusk' }),
						metadata: { resolutionSummary: 'Left over from an earlier close.' },
					},
				],
			},
		});

		expect(bodyOf(fetch)).toEqual({ details: 'Mosquitoes out back, worse at dusk' });
	});

	it('closes without a reason when none was given', async () => {
		// A close made from somewhere with no dialog still closes. The server supplies
		// its own plain wording rather than the write failing over a missing field.
		const fetch = stubFetch();

		await createServiceRequestMutationHandlers({ serverUrl: SERVER }).onUpdate({
			transaction: {
				mutations: [
					{
						original: request(),
						modified: request({ closedAt: '2026-08-10T17:00:00.000Z' }),
					},
				],
			},
		});

		expect(bodyOf(fetch)).toEqual({ closedAt: '2026-08-10T17:00:00.000Z' });
	});
});

const SERVER = 'https://example.test';

// Typed with the arguments it is called with, not as a bare thunk: `bodyOf` reads
// the second one, and a zero-argument mock types `calls` as empty tuples.
function stubFetch() {
	const fetch = vi.fn(
		async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ txid: 42 })),
	);
	vi.stubGlobal('fetch', fetch);
	return fetch;
}

/** The PATCH body the handler actually put on the wire. */
function bodyOf(fetch: ReturnType<typeof stubFetch>): unknown {
	return JSON.parse(String(fetch.mock.calls[0]?.[1]?.body));
}

function request(overrides: Partial<ServiceRequestRow> = {}): ServiceRequestRow {
	return {
		id: 'request-1',
		organizationId: 'organization-1',
		lat: 47.61,
		lng: -122.33,
		geomType: 'Point',
		displayName: 1024,
		intakeType: 'phone',
		requestDate: '2026-08-03',
		addressId: 'address-1',
		contactId: 'contact-1',
		receivedByProfileId: null,
		details: 'Mosquitoes out back',
		closedAt: null,
		closedByProfileId: null,
		metadata: null,
		createdByProfileId: null,
		updatedByProfileId: null,
		createdAt: '2026-08-03T09:00:00.000Z',
		updatedAt: '2026-08-03T09:00:00.000Z',
		...overrides,
	};
}

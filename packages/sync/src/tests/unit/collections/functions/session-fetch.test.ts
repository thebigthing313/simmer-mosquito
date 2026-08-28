/**
 * What every request this package makes does when the server refuses it.
 *
 * Shape streams and command writes carry the session cookie and nothing else.
 * Since #298 the routes behind them verify the session and leave renewing it to
 * `/auth/me`, so an access token that ages out mid-session arrives here as a
 * 401. These pin the answer: renew once, ask once more, and never a third time.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	sessionFetch,
	setSessionRecovery,
} from '../../../../collections/functions/session-fetch.js';

function stubResponses(...statuses: readonly number[]) {
	const remaining = [...statuses];
	const fetchMock = vi.fn<typeof fetch>(
		async () => new Response(null, { status: remaining.shift() ?? 200 }),
	);
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

describe('sessionFetch', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		setSessionRecovery(null);
	});

	it('renews the session and retries once', async () => {
		const recover = vi.fn(async () => true);
		setSessionRecovery(recover);
		const fetchMock = stubResponses(401, 200);

		const response = await sessionFetch('https://example.test/sync/shapes/units');

		expect({ status: response.status, calls: fetchMock.mock.calls.length }).toEqual({
			status: 200,
			calls: 2,
		});
		expect(recover).toHaveBeenCalledOnce();
	});

	it('retries at most once, so a refusal that outlives the renewal is not a loop', async () => {
		// The failure worth more than the retry: a route refusing this caller for a
		// reason a session cannot fix, asked forever.
		setSessionRecovery(async () => true);
		const fetchMock = stubResponses(401, 401);

		const response = await sessionFetch('https://example.test/sync/shapes/units');

		expect({ status: response.status, calls: fetchMock.mock.calls.length }).toEqual({
			status: 401,
			calls: 2,
		});
	});

	it('hands back the refusal when the session could not be renewed', async () => {
		// The app is being told the session is gone. It signs the reader out from
		// its own side; there is nothing left here to retry.
		setSessionRecovery(async () => false);
		const fetchMock = stubResponses(401, 200);

		const response = await sessionFetch('https://example.test/sync/shapes/units');

		expect({ status: response.status, calls: fetchMock.mock.calls.length }).toEqual({
			status: 401,
			calls: 1,
		});
	});

	it('leaves a 403 alone, because it is a decided answer rather than an expiry', async () => {
		// The console's refusals are 403s from `/admin/*` and have their own
		// screens. Renewing on one would ask `/auth/me`, be refused the same way,
		// read that as a dead session, and bounce an operator to sign-in instead of
		// telling them what is wrong.
		const recover = vi.fn(async () => true);
		setSessionRecovery(recover);
		const fetchMock = stubResponses(403);

		const response = await sessionFetch('https://example.test/admin/organizations');

		expect({ status: response.status, calls: fetchMock.mock.calls.length }).toEqual({
			status: 403,
			calls: 1,
		});
		expect(recover).not.toHaveBeenCalled();
	});

	it('leaves every other answer alone, so a 500 is not read as a session ending', async () => {
		const recover = vi.fn(async () => true);
		setSessionRecovery(recover);
		const fetchMock = stubResponses(500);

		const response = await sessionFetch('https://example.test/sync/shapes/units');

		expect({ status: response.status, calls: fetchMock.mock.calls.length }).toEqual({
			status: 500,
			calls: 1,
		});
		expect(recover).not.toHaveBeenCalled();
	});

	it('asks once and gives up when no app installed a renewal', async () => {
		// What `apps/mobile` gets today, and what every client did before #298.
		const fetchMock = stubResponses(401, 200);

		const response = await sessionFetch('https://example.test/sync/shapes/units');

		expect({ status: response.status, calls: fetchMock.mock.calls.length }).toEqual({
			status: 401,
			calls: 1,
		});
	});

	it('retries a request that carried a body, rather than one already spent', async () => {
		// Subset reads and every command write are POSTs with a body, and a
		// `Request` can only be read once. Retrying the spent object throws instead
		// of asking again, which surfaces as a write that failed for the wrong
		// reason.
		setSessionRecovery(async () => true);
		const fetchMock = stubResponses(401, 200);

		const response = await sessionFetch(
			new Request('https://example.test/commands/habitats', {
				method: 'POST',
				body: JSON.stringify({ intents: ['larvalSurveillance.createHabitat'] }),
			}),
		);

		expect(response.status).toBe(200);
		const retried = fetchMock.mock.calls[1]?.[0] as unknown as Request;
		await expect(retried.text()).resolves.toBe(
			JSON.stringify({ intents: ['larvalSurveillance.createHabitat'] }),
		);
	});
});

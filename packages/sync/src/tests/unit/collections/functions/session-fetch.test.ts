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
	setSessionFetcher,
	setSessionRecovery,
} from '../../../../collections/functions/session-fetch.js';

function respondingWith(...statuses: readonly number[]) {
	const remaining = [...statuses];
	return vi.fn<typeof fetch>(async () => new Response(null, { status: remaining.shift() ?? 200 }));
}

/**
 * This app's transport, installed the way an app installs one.
 *
 * Every case here installs one, because since #694 a send with none installed
 * throws rather than reaching the bare global. The case asserting that refusal
 * installs nothing, and it is the only one.
 */
function installedTransport(...statuses: readonly number[]) {
	const fetchMock = respondingWith(...statuses);
	setSessionFetcher(fetchMock);
	return fetchMock;
}

/** The bare global, which no request in this package may reach. */
function stubGlobalFetch(...statuses: readonly number[]) {
	const fetchMock = respondingWith(...statuses);
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

describe('sessionFetch', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		setSessionRecovery(null);
		setSessionFetcher(null);
	});

	it('renews the session and retries once', async () => {
		const recover = vi.fn(async () => true);
		setSessionRecovery(recover);
		const fetchMock = installedTransport(401, 200);

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
		const fetchMock = installedTransport(401, 401);

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
		const fetchMock = installedTransport(401, 200);

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
		const fetchMock = installedTransport(403);

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
		const fetchMock = installedTransport(500);

		const response = await sessionFetch('https://example.test/sync/shapes/units');

		expect({ status: response.status, calls: fetchMock.mock.calls.length }).toEqual({
			status: 500,
			calls: 1,
		});
		expect(recover).not.toHaveBeenCalled();
	});

	it('asks once and gives up when no app installed a renewal', async () => {
		// What `apps/mobile` gets today, and what every client did before #298.
		const fetchMock = installedTransport(401, 200);

		const response = await sessionFetch('https://example.test/sync/shapes/units');

		expect({ status: response.status, calls: fetchMock.mock.calls.length }).toEqual({
			status: 401,
			calls: 1,
		});
	});

	it('refuses to send at all when no app installed a transport', async () => {
		// #694. The fallback used to be bare `fetch`, which omits the cookie
		// cross-origin: every read and every write would go out unauthenticated and
		// the app would draw as empty rather than as refused. Nothing here can pick
		// a credential in its place, so the request does not happen and the error
		// says which call is missing.
		const globalFetch = stubGlobalFetch(200);

		await expect(sessionFetch('https://example.test/sync/shapes/units')).rejects.toThrow(
			/setSessionFetcher/,
		);
		expect(globalFetch).not.toHaveBeenCalled();
	});

	it('retries a request that carried a body, rather than one already spent', async () => {
		// Subset reads and every command write are POSTs with a body, and a
		// `Request` can only be read once. Retrying the spent object throws instead
		// of asking again, which surfaces as a write that failed for the wrong
		// reason.
		setSessionRecovery(async () => true);
		const fetchMock = installedTransport(401, 200);

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

	it('sends through the fetcher the app installed rather than the bare global', async () => {
		// The whole of why this exists. A cookie is not the only credential a host
		// can carry: `apps/mobile` holds the sealed session in the device keystore
		// and sends it as a bearer (ADR 0016), and this package has no way to know
		// which of the two it is running under.
		const installed = installedTransport(200);
		const globalFetch = stubGlobalFetch(200);

		await sessionFetch('https://example.test/sync/shapes/units');

		expect(installed).toHaveBeenCalledOnce();
		expect(globalFetch).not.toHaveBeenCalled();
	});

	it('retries through the installed fetcher, so the second attempt carries the same credential', async () => {
		// A retry on the bare global would go out with no credential at all and be
		// refused a second time — a renewal that looks like it worked and a request
		// that never had a chance.
		const installed = installedTransport(401, 200);
		setSessionRecovery(async () => true);
		const globalFetch = stubGlobalFetch(200, 200);

		const response = await sessionFetch('https://example.test/sync/shapes/units');

		expect({ status: response.status, calls: installed.mock.calls.length }).toEqual({
			status: 200,
			calls: 2,
		});
		expect(globalFetch).not.toHaveBeenCalled();
	});
});

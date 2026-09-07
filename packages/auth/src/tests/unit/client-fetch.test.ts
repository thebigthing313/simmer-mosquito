/**
 * The credential a client carries, on any path rather than only `/auth/*`.
 *
 * ADR 0016 gives a token client three rules: declare itself with
 * `x-simmer-client`, send the sealed session as a bearer, and keep whatever
 * comes back in `x-simmer-session`. All three lived in a closure no caller
 * outside this module could reach, so the shape and command routes — every read
 * and every write `apps/mobile` will make — had no way to obey them. These pin
 * the rules on a path that is not an auth one, which is what could not be
 * written before.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cookieFetch, createAuthClient, type SessionTransport } from '../../browser.js';

afterEach(() => {
	vi.unstubAllGlobals();
});

function stubFetch(response = new Response(null, { status: 200 })) {
	const fetchMock = vi.fn<typeof fetch>(async () => response);
	vi.stubGlobal('fetch', fetchMock);
	return fetchMock;
}

/** The request the stub was handed, as the headers and the fields worth asserting. */
function sentRequest(fetchMock: ReturnType<typeof stubFetch>) {
	const [input, init] = fetchMock.mock.calls[0] ?? [];
	return {
		url: String(input),
		headers: new Headers(init?.headers),
		credentials: init?.credentials,
	};
}

function storedSession(value: string | null) {
	const write = vi.fn(async () => {});
	const transport: SessionTransport = {
		read: async () => value,
		write,
		clear: async () => {},
	};
	return { transport, write };
}

describe('AuthClient.fetch', () => {
	it('carries the sealed session on a path that is not an auth one', async () => {
		const { transport } = storedSession('sealed.session.value');
		const fetchMock = stubFetch();

		const client = createAuthClient({
			serverUrl: 'https://api.example.test',
			session: transport,
		});
		await client.fetch('/commands/habitats', { method: 'POST' });

		const sent = sentRequest(fetchMock);
		expect({
			url: sent.url,
			client: sent.headers.get('x-simmer-client'),
			authorization: sent.headers.get('authorization'),
		}).toEqual({
			url: 'https://api.example.test/commands/habitats',
			client: 'token',
			authorization: 'Bearer sealed.session.value',
		});
	});

	it('keeps a session rotated on a path that is not an auth one', async () => {
		// The failure ADR 0016 says the design most needed to close. The server
		// already answers a shape or a command with `x-simmer-session` when a token
		// client asked; until this member existed, nothing on those two paths could
		// read it, and the app would break hours after a sign-in that looked fine.
		const { transport, write } = storedSession('stale.session.value');
		stubFetch(
			new Response(null, { status: 200, headers: { 'x-simmer-session': 'rotated.session' } }),
		);

		const client = createAuthClient({
			serverUrl: 'https://api.example.test',
			session: transport,
		});
		await client.fetch('/sync/shapes/habitats');

		expect(write).toHaveBeenCalledExactlyOnceWith('rotated.session');
	});

	it('sends the cookie and no bearer when the client holds no session of its own', async () => {
		// What `apps/web` and `apps/admin` are: the browser holds the sealed session
		// in an httpOnly cookie this client never sees, so there is nothing to
		// declare and nothing to attach.
		const fetchMock = stubFetch();

		const client = createAuthClient({ serverUrl: 'https://api.example.test' });
		await client.fetch('/sync/shapes/habitats');

		const sent = sentRequest(fetchMock);
		expect({
			credentials: sent.credentials,
			client: sent.headers.get('x-simmer-client'),
			authorization: sent.headers.get('authorization'),
		}).toEqual({ credentials: 'include', client: null, authorization: null });
	});

	it('leaves a request the caller addressed itself alone', async () => {
		// `packages/sync` builds whole URLs from the app's `serverUrl` and hands
		// Electric's own `Request` objects straight through, so only a path is
		// resolved against this client's origin.
		const fetchMock = stubFetch();

		const client = createAuthClient({ serverUrl: 'https://api.example.test' });
		await client.fetch('https://tiles.example.test/map/tiles/habitats/1/2/3');

		expect(sentRequest(fetchMock).url).toBe('https://tiles.example.test/map/tiles/habitats/1/2/3');
	});

	it('refuses a string that is neither a path nor a whole URL', async () => {
		// `fetch` would resolve it against the document, which on both front ends
		// is the SPA rather than the API: the request lands on the static host,
		// comes back 200 with a page of HTML, and is read as an empty result set.
		const fetchMock = stubFetch();

		const client = createAuthClient({ serverUrl: 'https://api.example.test' });

		await expect(client.fetch('auth/me')).rejects.toThrow('auth/me');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('keeps the headers a request already carried', async () => {
		// Electric sets its own on the subset POSTs it builds. Replacing them with
		// the credential headers would send a POST body with no content type.
		const { transport } = storedSession('sealed.session.value');
		const fetchMock = stubFetch();

		const client = createAuthClient({
			serverUrl: 'https://api.example.test',
			session: transport,
		});
		await client.fetch(
			new Request('https://api.example.test/sync/shapes/habitats', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: '{}',
			}),
		);

		const sent = sentRequest(fetchMock);
		expect({
			contentType: sent.headers.get('content-type'),
			authorization: sent.headers.get('authorization'),
		}).toEqual({
			contentType: 'application/json',
			authorization: 'Bearer sealed.session.value',
		});
	});
});

describe('cookieFetch', () => {
	it('sends the cookie and declares nothing, which is what the two web apps did before', async () => {
		const fetchMock = stubFetch();

		await cookieFetch('https://api.example.test/sync/shapes/habitats');

		const sent = sentRequest(fetchMock);
		expect({
			credentials: sent.credentials,
			client: sent.headers.get('x-simmer-client'),
			authorization: sent.headers.get('authorization'),
		}).toEqual({ credentials: 'include', client: null, authorization: null });
	});
});

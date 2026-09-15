/**
 * How a refused command reads, which is the only thing the user sees when a
 * write does not land.
 *
 * The case worth pinning is the one that used to leak. A gateway, a proxy, or a
 * wrong path answers `404 Not Found` as plain text; `JSON.parse` throws on it,
 * and without reading the body as text first the parser's own error surfaces
 * instead of the HTTP one — so somebody is told something about JSON when what
 * happened is that the route was not there.
 *
 * Re-homed from `apps/web`, where it covered three hand-rolled identity calls
 * that are commands now. The module went; the guarantee did not, and it belongs
 * here, where it holds for every table.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setSessionFetcher } from '../../../../collections/functions/session-fetch.js';
import {
	CommandError,
	refusalSentence,
	writeCommand,
} from '../../../../collections/functions/write-command.js';
import { globalTransport } from './global-transport.js';

const URL = 'http://localhost:3002/commands/memberships';

describe('writeCommand', () => {
	// What each case stubs is the answer, not the credential, so the transport
	// installed here defers to the stub. Without one `sessionFetch` refuses the
	// send (#694) and every case below reports that instead of what it asserts.
	beforeEach(() => {
		setSessionFetcher(globalTransport);
	});

	afterEach(() => {
		setSessionFetcher(null);
		vi.unstubAllGlobals();
	});

	it('reports a non-json 404 without leaking a JSON parser error', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response('404 Not Found', { status: 404 })),
		);

		const thrown = await writeCommand(URL, 'PATCH', { intents: [] }, 'Unable to update role.').then(
			() => null,
			(error: unknown) => error,
		);

		expect(thrown).toBeInstanceOf(CommandError);
		expect((thrown as CommandError).status).toBe(404);
		expect((thrown as Error).message).toContain('404 Not Found');
	});

	// The endpoints answer with a txid whenever they wrote, so its absence means no
	// write happened whatever the status line said. Reading that as success leaves
	// an optimistic row on screen forever.
	it('refuses a 2xx that carried no txid', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })),
		);

		await expect(
			writeCommand(URL, 'PATCH', { intents: [] }, 'Unable to remove this member.'),
		).rejects.toThrow('Unable to remove this member.');
	});

	it('answers with the transaction the write committed under', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ txid: 12 }), { status: 200 })),
		);

		await expect(writeCommand(URL, 'POST', { intents: [] }, 'Unable to write.')).resolves.toBe(12);
	});

	it('states a reason the server named rather than the fallback', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ error: 'forbidden', reason: 'Not your rung.' }), {
						status: 403,
					}),
			),
		);

		await expect(writeCommand(URL, 'POST', { intents: [] }, 'Unable to write.')).rejects.toThrow(
			'Not your rung.',
		);
	});

	// The shape that used to read differently at each of the eight call sites.
	// A sentence of spaces says nothing, so it is absent and the fallback names
	// the record instead (#929).
	it('takes the fallback over a reason that is only whitespace', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ error: 'forbidden', reason: '   ' }), { status: 403 }),
			),
		);

		await expect(writeCommand(URL, 'POST', { intents: [] }, 'Unable to write.')).rejects.toThrow(
			'Unable to write.',
		);
	});
});

/**
 * The one reader every command-shaped refusal goes through (#929).
 *
 * Eight call sites carried this rule before, on three emptiness tests between
 * them, so `reason: '   '` rendered as an empty red box through some and took
 * the fallback through others. The whitespace rows are the ones that used to
 * disagree; the rest pin the precedence.
 */
describe('refusalSentence', () => {
	const shapes: readonly {
		readonly name: string;
		readonly body: unknown;
		readonly reads: string;
	}[] = [
		{ name: 'a reason', body: { reason: 'Not your rung.' }, reads: 'Not your rung.' },
		{
			name: 'a reason over a message',
			body: { reason: 'Not your rung.', message: 'Forbidden.' },
			reads: 'Not your rung.',
		},
		{ name: 'a message alone', body: { message: 'Forbidden.' }, reads: 'Forbidden.' },
		{ name: 'an empty reason', body: { reason: '' }, reads: 'Unable to save.' },
		{ name: 'a whitespace reason', body: { reason: '   ' }, reads: 'Unable to save.' },
		{
			name: 'a whitespace reason over a message',
			body: { reason: '   ', message: 'Forbidden.' },
			reads: 'Forbidden.',
		},
		{ name: 'a whitespace message', body: { message: '\t\n' }, reads: 'Unable to save.' },
		{ name: 'a code and no sentence', body: { error: 'forbidden' }, reads: 'Unable to save.' },
		{ name: 'a reason that is not a string', body: { reason: 42 }, reads: 'Unable to save.' },
		{ name: 'a body that is not an object', body: 'nope', reads: 'Unable to save.' },
		{ name: 'no body at all', body: null, reads: 'Unable to save.' },
	];

	for (const shape of shapes) {
		it(`reads ${shape.name} as "${shape.reads}"`, () => {
			expect(refusalSentence(shape.body, 'Unable to save.')).toBe(shape.reads);
		});
	}
});

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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandError, writeCommand } from '../../../../collections/functions/write-command.js';

const URL = 'http://localhost:3002/commands/memberships';

describe('writeCommand', () => {
	afterEach(() => {
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
});

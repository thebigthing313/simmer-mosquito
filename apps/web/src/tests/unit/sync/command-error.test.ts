import { writeCommand } from '@simmer-mosquito/sync';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	CommandError,
	commandErrorFrom,
	isDeleteBlocked,
	messageFromBody,
	readBlockers,
	readResponseBody,
} from '../../../sync/command-error';

function failed(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), { status });
}

describe('commandErrorFrom', () => {
	it('keeps the message every existing catch already reads', () => {
		// The sixteen mutation modules threw a bare `Error` with exactly this
		// sentence. Anything that catches and shows `error.message` has to keep
		// working, or this change would be a regression dressed as a fix.
		const error = commandErrorFrom(
			failed(403, { error: 'forbidden', reason: 'Viewers have read-only access.' }),
			{ error: 'forbidden', reason: 'Viewers have read-only access.' },
			'Unable to save address.',
		);

		expect(error).toBeInstanceOf(Error);
		expect(error.message).toBe('Viewers have read-only access.');
	});

	it('carries the status and the parsed body', () => {
		const body = { error: 'delete_blocked', message: 'Blocked.', blockers: [] };
		const error = commandErrorFrom(failed(409, body), body, 'Unable to delete.');

		expect(error.status).toBe(409);
		expect(error.body).toEqual(body);
	});

	it('falls back when the body has nothing to say', () => {
		const error = commandErrorFrom(failed(502, {}), {}, 'Unable to save address.');

		expect(error.message).toBe('Unable to save address.');
	});
});

describe('messageFromBody', () => {
	it('prefers reason over message', () => {
		// Both appear on refusals. `reason` is the specific one — "Collectors can
		// only work assignments assigned to them" versus "Forbidden".
		expect(messageFromBody({ reason: 'Specific.', message: 'Generic.' }, 'fallback')).toBe(
			'Specific.',
		);
	});

	it('takes message when there is no reason', () => {
		expect(messageFromBody({ message: 'Generic.' }, 'fallback')).toBe('Generic.');
	});

	it('ignores empty strings and non-objects', () => {
		expect(messageFromBody({ reason: '', message: '' }, 'fallback')).toBe('fallback');
		expect(messageFromBody('not json', 'fallback')).toBe('fallback');
		expect(messageFromBody(null, 'fallback')).toBe('fallback');
	});
});

describe('readBlockers', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	const blockers = [
		{ key: 'inspections', count: 3, singular: 'inspection', plural: 'inspections' },
	];

	it('reads what refused the delete straight off the 409', () => {
		// The whole point of the payload: name the blocker without a second
		// round-trip to the impact endpoint.
		const body = { error: 'delete_blocked', message: 'Blocked.', blockers };
		const error = commandErrorFrom(failed(409, body), body, 'Unable to delete.');

		expect(isDeleteBlocked(error)).toBe(true);
		expect(readBlockers(error)).toEqual(blockers);
	});

	it('is empty for every other kind of failure', () => {
		const body = { error: 'forbidden', reason: 'Viewers have read-only access.' };

		expect(readBlockers(commandErrorFrom(failed(403, body), body, 'Unable to delete.'))).toEqual(
			[],
		);
		expect(readBlockers(new Error('network'))).toEqual([]);
		expect(readBlockers(undefined)).toEqual([]);
	});

	// The test above builds the error itself, so it only ever proves `readBlockers`
	// agrees with `commandErrorFrom`. That is how #323 survived: the class a write
	// throws came from `@simmer-mosquito/sync` and the one tested against was a
	// second copy declared here, so `instanceof` was false for every real refusal
	// and the danger zone listed nothing. This test throws the error the write
	// layer throws, over a real refused response.
	it('reads the blockers off the error a collection write throws', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ error: 'delete_blocked', message: 'Blocked.', blockers }), {
						status: 409,
					}),
			),
		);

		const thrown = await writeCommand(
			'http://localhost:3002/commands/habitats',
			'DELETE',
			{ intents: [] },
			'Unable to delete the habitat.',
		).then(
			() => null,
			(error: unknown) => error,
		);

		expect(thrown).toBeInstanceOf(CommandError);
		expect(isDeleteBlocked(thrown)).toBe(true);
		expect(readBlockers(thrown)).toEqual(blockers);
	});

	it('does not trust an error named delete_blocked without blockers', () => {
		const body = { error: 'delete_blocked', message: 'Blocked.' };

		expect(isDeleteBlocked(new CommandError('Blocked.', 409, body))).toBe(false);
	});
});

describe('readResponseBody', () => {
	it('parses a JSON body', async () => {
		await expect(readResponseBody(failed(400, { error: 'invalid_command' }))).resolves.toEqual({
			error: 'invalid_command',
		});
	});

	it('answers an empty object for a body that is not JSON', async () => {
		// A proxy or gateway can answer HTML, and `response.json()` throws on it.
		// The caller's fallback sentence is better than a parse error.
		await expect(
			readResponseBody(new Response('<html>502 Bad Gateway</html>', { status: 502 })),
		).resolves.toEqual({});
		await expect(readResponseBody(new Response('', { status: 500 }))).resolves.toEqual({});
	});

	it('answers an empty object for the bare text an unhandled 500 returns', async () => {
		// What Hono sends when a handler throws. Parsed, it reached the operator as
		// `Unexpected token 'I', "Internal S"... is not valid JSON` — a message about
		// the client's parser, in place of the fault that actually happened.
		await expect(
			readResponseBody(new Response('Internal Server Error', { status: 500 })),
		).resolves.toEqual({});
	});

	it('answers an empty object for JSON that is not an object', async () => {
		// Callers test the parsed body with `'txid' in result`, and `in` throws on a
		// string or a number — the same failure shape this exists to prevent.
		await expect(readResponseBody(new Response('"nope"', { status: 500 }))).resolves.toEqual({});
		await expect(readResponseBody(new Response('42', { status: 500 }))).resolves.toEqual({});
		await expect(readResponseBody(new Response('null', { status: 500 }))).resolves.toEqual({});
	});
});

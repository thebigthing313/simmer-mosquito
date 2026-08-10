import { describe, expect, it } from 'vitest';
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
});

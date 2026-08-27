/**
 * What a response from an identity route means.
 *
 * Three tables are written by REST rather than by command — `organizations`,
 * `profiles`, `memberships` — because identity writes cannot join the command
 * vocabulary (#130). They lose the thing every command write gets for free: a
 * shared answer to "did that work". This is that answer, and the case worth
 * pinning is the quiet one.
 *
 * A 2xx carrying no `txid` is a failure. Every one of these routes answers with
 * one whenever it wrote, so its absence means nothing was written — but the
 * status line says otherwise, and a caller that believes the status line leaves
 * the optimistic row on screen looking saved. Nothing throws, nothing logs, and
 * the row disappears on the next reload.
 */

import { CommandError } from '@simmer-mosquito/sync';
import { describe, expect, it } from 'vitest';
import { restRefusalFor } from '../../../../hooks/mutations/rest-writes';

const FALLBACK = 'Unable to save changes.';

describe('restRefusalFor', () => {
	it('accepts a write that answered with a txid', () => {
		expect(restRefusalFor(200, true, { txid: 4821 }, FALLBACK)).toBeNull();
	});

	it('refuses a 2xx that wrote nothing', () => {
		const refusal = restRefusalFor(200, true, { updatedAt: '2026-08-18T00:00:00Z' }, FALLBACK);

		expect(refusal).toBeInstanceOf(CommandError);
		expect(refusal?.message).toBe(FALLBACK);
	});

	it('refuses a txid that is not a number', () => {
		// A proxy that answers with its own JSON, or a route that stringified the
		// id. Either way no write of ours committed under it.
		expect(restRefusalFor(200, true, { txid: '4821' }, FALLBACK)).toBeInstanceOf(CommandError);
	});

	it('prefers the server’s reason to the fallback, then its message', () => {
		expect(
			restRefusalFor(403, false, { error: 'forbidden', reason: 'Only owners may.' }, FALLBACK)
				?.message,
		).toBe('Only owners may.');
		expect(restRefusalFor(500, false, { message: 'boom' }, FALLBACK)?.message).toBe('boom');
	});

	it('carries the status and body, so a caller can re-ask', () => {
		const refusal = restRefusalFor(409, false, { error: 'membership_conflict' }, FALLBACK);

		expect(refusal).toBeInstanceOf(CommandError);
		expect((refusal as CommandError).status).toBe(409);
		expect((refusal as CommandError).body).toMatchObject({ error: 'membership_conflict' });
	});

	it('still says something when a refusal explains nothing', () => {
		expect(restRefusalFor(502, false, {}, FALLBACK)?.message).toBe(FALLBACK);
	});
});

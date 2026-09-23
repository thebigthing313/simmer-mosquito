/**
 * The one reading of a `POST /auth/*` body. The eleven operations hand it a
 * wire type and a table of readers, so what is pinned here is the shape every
 * one of them inherits: `ok` wins, a known status reaches its reader, and
 * everything else is the `error` arm carrying the body's `reason` when it has
 * one. The typed half is `tsc`'s: `refused` is keyed by the body's statuses, so
 * a status the server adds fails the client's compile until it is named.
 */

import { describe, expect, it } from 'vitest';

import { readAuthOutcome } from '../../client/read-auth-outcome.js';
import type { SignInBody } from '../../client/wire.js';

type Read = { readonly status: string; readonly reason?: string; readonly token?: string };

function read(body: unknown) {
	return readAuthOutcome<SignInBody, Read>(body, {
		ok: (ok) => ({
			status: ok.organizationRequired ? 'authenticated_without_org' : 'authenticated',
		}),
		refused: {
			verification_required: (b) => ({ status: 'verify', token: b.pendingAuthenticationToken }),
			organization_selection_required: () => ({ status: 'pick' }),
			invalid_credentials: () => ({ status: 'invalid_credentials' }),
		},
		fallback: 'Unable to sign in.',
	});
}

describe('readAuthOutcome', () => {
	it('reads ok ahead of everything', () => {
		expect(read({ ok: true, organizationRequired: true })).toEqual({
			status: 'authenticated_without_org',
		});
	});

	it('hands a known status its typed body', () => {
		expect(
			read({ ok: false, status: 'verification_required', pendingAuthenticationToken: 'p' }),
		).toEqual({
			status: 'verify',
			token: 'p',
		});
		expect(read({ ok: false, status: 'invalid_credentials' })).toEqual({
			status: 'invalid_credentials',
		});
	});

	it('reads invalid_payload as the error arm carrying the server sentence', () => {
		expect(
			read({ ok: false, status: 'invalid_payload', reason: 'A valid email is required.' }),
		).toEqual({
			status: 'error',
			reason: 'A valid email is required.',
		});
	});

	// The staging interlock answers `{ error, reason }` with no `ok` at all.
	it('reads a body outside the wire type as the error arm with its reason', () => {
		expect(read({ error: 'workos_identity_writes_disabled', reason: 'Staging refuses.' })).toEqual({
			status: 'error',
			reason: 'Staging refuses.',
		});
	});

	it('reads an unreadable or empty body as the fallback', () => {
		expect(read({})).toEqual({ status: 'error', reason: 'Unable to sign in.' });
		expect(read(null)).toEqual({ status: 'error', reason: 'Unable to sign in.' });
		expect(read('<html>')).toEqual({ status: 'error', reason: 'Unable to sign in.' });
		expect(read({ ok: false, status: 'invalid_credentials', reason: '   ' })).toEqual({
			status: 'invalid_credentials',
		});
	});

	// `hasOwnProperty` and friends are on every object's prototype, and a status
	// spelled that way must not reach them.
	it('does not read a status off the prototype', () => {
		expect(read({ ok: false, status: 'toString' })).toEqual({
			status: 'error',
			reason: 'Unable to sign in.',
		});
	});
});

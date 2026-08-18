/**
 * What a refused agency write means — and, above all, that a conflict is one.
 *
 * The handler this replaces implemented optimistic concurrency and then undid it:
 * it caught the server's `409 organization_conflict` and immediately re-sent the
 * same body with `expectedUpdatedAt: null`, which the server has nothing to
 * compare and cannot refuse. So the check cost a round trip and stopped nothing,
 * and the admin who pressed Save second overwrote the one who pressed it first
 * with no sign to either that it had happened.
 *
 * That is the failure this file exists to keep out. It is not visible in a diff of
 * the request — the second attempt is well-formed and answered `200` — so the only
 * place it can be caught is here, at the decision about what a response means.
 */

import { CommandError } from '@simmer-mosquito/sync';
import { describe, expect, it } from 'vitest';
import {
	OrganizationConflictError,
	organizationRefusalFor,
} from '../../../../hooks/mutations/organization-writes';

describe('organizationRefusalFor', () => {
	it('accepts a write that answered with a txid', () => {
		expect(
			organizationRefusalFor(200, true, { txid: 8123, updatedAt: '2026-08-18T00:00:00Z' }),
		).toBeNull();
	});

	it('raises a conflict rather than retrying without the guard', () => {
		const refusal = organizationRefusalFor(409, false, {
			error: 'organization_conflict',
			updatedAt: '2026-08-18T00:00:00.000Z',
		});

		expect(refusal).toBeInstanceOf(OrganizationConflictError);
	});

	it('knows the settings routes spell the same refusal differently', () => {
		// `settings_conflict` from the seven command routes, `organization_conflict`
		// from the details route. One is not a synonym the client may drop: missing
		// it would send the conflict through the generic path and show the raw
		// error string instead of what to do about it.
		expect(organizationRefusalFor(409, false, { error: 'settings_conflict' })).toBeInstanceOf(
			OrganizationConflictError,
		);
	});

	it('does not read an unrelated 409 as a conflict', () => {
		const refusal = organizationRefusalFor(409, false, { error: 'slug_taken', reason: 'Taken.' });

		expect(refusal).toBeInstanceOf(CommandError);
		expect(refusal).not.toBeInstanceOf(OrganizationConflictError);
	});

	it('refuses a 2xx that wrote nothing', () => {
		// Both routes answer with a txid whenever they wrote, so a success without
		// one means no write happened whatever the status line claimed. Treating it
		// as success would leave the optimistic row on screen forever.
		const refusal = organizationRefusalFor(200, true, { updatedAt: '2026-08-18T00:00:00Z' });

		expect(refusal).toBeInstanceOf(CommandError);
	});

	it('prefers the server’s reason to the fallback', () => {
		const refusal = organizationRefusalFor(400, false, {
			error: 'invalid_unit_default',
			reason: 'gal is not a weight unit.',
		});

		expect(refusal?.message).toBe('gal is not a weight unit.');
	});

	it('still says something when a refusal explains nothing', () => {
		expect(organizationRefusalFor(500, false, {})?.message).toBe('Unable to save changes.');
	});
});

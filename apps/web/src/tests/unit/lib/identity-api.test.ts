/**
 * The three identity calls that settle two systems.
 *
 * Inviting somebody, changing a role, and ending a Membership each touch WorkOS
 * and Postgres, so none of them is a collection write and none is optimistic —
 * the surface awaits the server's answer. What that makes load-bearing is the
 * refusal, because it is the only thing the user sees when one of the two halves
 * says no.
 *
 * The case here is the one that used to leak: a gateway or a wrong path answers
 * with `404 Not Found` as plain text, `JSON.parse` throws on it, and the parser's
 * own error surfaces instead of the HTTP one — so the user is told something
 * about JSON when what happened is that the route was not there.
 *
 * Re-homed from `sync/profileMutations.test.ts` when these moved out of the old
 * sync seam. The module went; the guarantee did not.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	inviteOrganizationProfile,
	removeOrganizationMembership,
	updateOrganizationMembershipRole,
} from '../../../lib/identity-api';

const SERVER = 'http://localhost:3002';

describe('identity api refusals', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('reports a non-json 404 without leaking a JSON parser error', async () => {
		const fetch = vi.fn(async () => new Response('404 Not Found', { status: 404 }));
		vi.stubGlobal('fetch', fetch);

		await expect(
			updateOrganizationMembershipRole(SERVER, 'membership-1', 'viewer'),
		).rejects.toThrow('Unable to update role.');
		expect(fetch).toHaveBeenCalledWith(
			`${SERVER}/organization/memberships/membership-1/role`,
			expect.objectContaining({ method: 'PATCH' }),
		);
	});

	it('ends a membership with DELETE and returns the server’s view of it', async () => {
		// The server's membership, not a locally-guessed one: the row it returns is
		// the result of settling WorkOS and Postgres together, and it is what the
		// surface renders.
		const membership = { id: 'membership-1', role: 'viewer', status: 'inactive' };
		const fetch = vi.fn(
			async () => new Response(JSON.stringify({ membership, txid: 12 }), { status: 200 }),
		);
		vi.stubGlobal('fetch', fetch);

		await expect(removeOrganizationMembership(SERVER, 'membership-1')).resolves.toMatchObject({
			id: 'membership-1',
			status: 'inactive',
		});
		expect(fetch).toHaveBeenCalledWith(
			`${SERVER}/organization/memberships/membership-1`,
			expect.objectContaining({ method: 'DELETE' }),
		);
	});

	it('refuses a 2xx removal that returned no membership', async () => {
		const fetch = vi.fn(async () => new Response(JSON.stringify({ txid: 12 }), { status: 200 }));
		vi.stubGlobal('fetch', fetch);

		await expect(removeOrganizationMembership(SERVER, 'membership-1')).rejects.toThrow(
			'Unable to remove this member.',
		);
	});

	it('sends an invitation with the profile it should attach to', async () => {
		// `profileId` is the whole reason the invite sheet offers a list: sending
		// `null` mints a second Profile for somebody the agency already records
		// work against, and the field history splits in two.
		const sent: RequestInit[] = [];
		const fetch = vi.fn(async (_url: string, init: RequestInit) => {
			sent.push(init);
			return new Response(JSON.stringify({ txid: 9 }), { status: 200 });
		});
		vi.stubGlobal('fetch', fetch);

		await inviteOrganizationProfile(SERVER, {
			email: 'crew@agency.test',
			displayName: 'Sam Rivera',
			role: 'collector',
			profileId: 'profile-7',
		});

		const body = JSON.parse(String(sent[0]?.body)) as { readonly profileId: string };
		expect(body.profileId).toBe('profile-7');
	});
});

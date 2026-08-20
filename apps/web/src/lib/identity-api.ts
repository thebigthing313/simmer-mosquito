/**
 * The three identity calls that are not writes to a collection.
 *
 * Inviting somebody, changing a role, and ending a Membership. None of them is a
 * command *yet* — ADR 0013 folds identity in, and these three are the hard end
 * of it, because each settles WorkOS as well as Postgres. The ADR admits them
 * under four rules; the one that decides whether a spanning command can be built
 * at all is the client-generated id, which an invitation does not currently
 * carry. Read `docs/domain-command-contract.md` before moving them.
 *
 * None of them is a collection write either, which is what separates them from
 * `hooks/mutations/use-profile-mutations.ts`:
 *
 * **An invitation has no row to apply.** It creates a Membership in `invited`
 * status *and* a WorkOS invitation, and which rows appear is the server's answer
 * rather than something the client can draw ahead of time.
 *
 * **A role change and an offboarding both settle two systems.** The WorkOS grant
 * and the SIMMER row have to agree, and the membership stream reflects the
 * result once they do. An optimistic local edit would be guessing at the half it
 * cannot see — and on the offboarding it would be guessing wrong, because a
 * sign-in used to silently resurrect an ended Membership until #129.
 *
 * So these are plain async functions that resolve when the server has settled,
 * and the surfaces await them rather than watching a transaction. They return
 * the server's own view of the Membership, which is what the caller renders.
 */

import type { SimmerRole } from '@simmer-mosquito/domain';
import type { AdminMembership } from '../auth';
import { commandErrorFrom, readResponseBody } from '../sync/command-error';

export async function inviteOrganizationProfile(
	serverUrl: string,
	input: {
		readonly email: string;
		readonly displayName: string;
		readonly role: string;
		/** An existing historical Profile to attach the login to, or `null` for a new one. */
		readonly profileId: string | null;
	},
): Promise<void> {
	const response = await fetch(`${serverUrl}/organization/invitations`, {
		method: 'POST',
		credentials: 'include',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
		},
		body: JSON.stringify(input),
	});
	const result = (await readResponseBody(response)) as
		| { readonly txid: number }
		| { readonly error: string; readonly reason?: string; readonly message?: string };

	if (!response.ok || !('txid' in result)) {
		throw commandErrorFrom(response, result, 'Unable to send invitation.');
	}
}

export async function updateOrganizationMembershipRole(
	serverUrl: string,
	membershipId: string,
	role: SimmerRole,
): Promise<AdminMembership> {
	const response = await fetch(`${serverUrl}/organization/memberships/${membershipId}/role`, {
		method: 'PATCH',
		credentials: 'include',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
		},
		body: JSON.stringify({ role }),
	});
	const result = (await readResponseBody(response)) as
		| { readonly membership: AdminMembership; readonly txid: number }
		| { readonly error: string; readonly reason?: string; readonly message?: string };

	if (!response.ok || !('membership' in result)) {
		throw commandErrorFrom(response, result, 'Unable to update role.');
	}

	return result.membership;
}

/** End somebody's access to this agency (ADR 0011's offboarding lifecycle). */
export async function removeOrganizationMembership(
	serverUrl: string,
	membershipId: string,
): Promise<AdminMembership> {
	const response = await fetch(`${serverUrl}/organization/memberships/${membershipId}`, {
		method: 'DELETE',
		credentials: 'include',
		headers: { accept: 'application/json' },
	});
	const result = (await readResponseBody(response)) as
		| { readonly membership: AdminMembership; readonly txid: number }
		| { readonly error: string; readonly reason?: string; readonly message?: string };

	if (!response.ok || !('membership' in result)) {
		throw commandErrorFrom(response, result, 'Unable to remove this member.');
	}

	return result.membership;
}

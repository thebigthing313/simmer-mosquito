/**
 * Writing the access a login holds on this organization.
 *
 * Four commands, and they take two different paths out of the browser for a
 * reason `docs/domain-command-contract.md` gives under "Commands that span two
 * systems": **no optimistic row for the half the client cannot see.**
 *
 * **A role change and an offboarding are ordinary collection writes.** Both move
 * one row this client fully determines — the role, or the `inactive` status the
 * row survives as. The WorkOS half of each writes nothing a client receives, so
 * the optimistic row and the synced row are the same row.
 *
 * **An invitation and a re-invitation are not.** What they settle is whether a
 * mail was delivered, which is not a column and not something to draw ahead of
 * the answer. An invitation also writes a Profile beside the Membership, and the
 * People page is looking at both. So those two post directly and then wait on the
 * transaction id the server committed under, which is the same wait the
 * collection path gets for free.
 *
 * ## The ids are minted here
 *
 * `identity.invite` carries the Membership id it will write, and the Profile id
 * when the invite is for somebody new. That is what makes a retry safe: the
 * second attempt collides on the primary key, and the server hands back the row
 * already there rather than mailing a second link. A dialog that picked an
 * existing historical Profile sends that Profile's id instead, and the server
 * discovers which of the two it is by looking.
 */

import type { SimmerRole } from '@simmer-mosquito/domain';
import type { Membership } from '@simmer-mosquito/sync';
import {
	commandPathFor,
	isTxIdConfirmationTimeout,
	settleWrite,
	writeCommand,
} from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { getServerUrl } from '../../auth';
import { memberships } from '../../lib/collections/memberships';
import { mutateCollection } from '../../lib/collections/mutate';
import { profiles } from '../../lib/collections/profiles';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { newRecordId } from './shared';

/** What the invite dialog holds. */
export interface InviteFields {
	readonly email: string;
	/** Blank is allowed: an invitation with no name uses the address. */
	readonly displayName: string;
	readonly role: SimmerRole;
	/** An existing historical Profile to attach the login to, or `null` for a new one. */
	readonly profileId: string | null;
}

export interface MembershipMutations {
	readonly invite: (fields: InviteFields) => Promise<void>;
	/** Replace the link somebody is holding, and set the role it will grant. */
	readonly reinvite: (membershipId: string, role: SimmerRole) => Promise<void>;
	readonly changeRole: (membershipId: string, role: SimmerRole) => Promise<void>;
	/** End somebody's access. The Membership survives at `inactive` (ADR 0011). */
	readonly endMembership: (membershipId: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useMembershipMutations(): MembershipMutations {
	const auth = useAuthSnapshot();
	const organizationId = auth?.authenticated === true ? auth.localIdentity.organizationId : null;

	const invite = useCallback(async (fields: InviteFields) => {
		await postMembershipCommand('POST', null, inviteCommandBody(fields, newRecordId));
	}, []);

	const reinvite = useCallback(async (membershipId: string, role: SimmerRole) => {
		await postMembershipCommand('PATCH', membershipId, {
			intents: ['identity.reinvite'],
			role,
		});
	}, []);

	const changeRole = useCallback(async (membershipId: string, role: SimmerRole) => {
		await settleWrite(
			mutateCollection(memberships(), {
				operation: 'update',
				intent: 'identity.changeRole',
				key: membershipId,
				changes: { role },
			}),
		);
	}, []);

	const endMembership = useCallback(async (membershipId: string) => {
		await settleWrite(
			mutateCollection(memberships(), {
				operation: 'update',
				intent: 'identity.endMembership',
				key: membershipId,
				// Not a delete: the row is the only record that access was ever held,
				// so it survives deactivated. `is_default` goes with it — left set, it
				// points at the one organization this person can no longer enter, and
				// their next sign-in has nowhere to go.
				changes: { status: 'inactive', is_default: false } satisfies Partial<Membership>,
			}),
		);
	}, []);

	return { invite, reinvite, changeRole, endMembership, canWrite: organizationId !== null };
}

/**
 * What an invitation says on the wire.
 *
 * Pulled out of the hook because two of its decisions are worth pinning and
 * neither is visible from a rendered dialog. `profile_id` is the whole reason
 * the sheet offers a list: sending a fresh id for somebody the organization
 * already records work against mints a second Profile, and the field history
 * splits in two. And a minted id is what makes a retry a retry, so it has to be
 * the same shape whether the Profile is new or picked.
 *
 * `mintId` is an argument for the test's sake and for no other reason.
 */
export function inviteCommandBody(
	fields: InviteFields,
	mintId: () => string,
): Record<string, unknown> {
	return {
		intents: ['identity.invite'],
		id: mintId(),
		profile_id: fields.profileId ?? mintId(),
		invited_email: fields.email,
		display_name: fields.displayName,
		role: fields.role,
	};
}

/**
 * Send a command that has no optimistic row, and wait for it to stream back.
 *
 * The txid wait is what the collection path does automatically; without it the
 * People page re-renders off rows that have not arrived, and an invitation looks
 * like it did nothing. It is skipped when nothing is subscribed, because a
 * collection with no subscribers has a paused stream and the wait does not
 * resolve late — it never resolves.
 *
 * Both collections are waited on. An invitation writes a Profile and a
 * Membership in one transaction, and the People page draws from a join of the
 * two, so waiting on one of them is waiting for half the answer.
 */
async function postMembershipCommand(
	method: 'POST' | 'PATCH',
	membershipId: string | null,
	body: Record<string, unknown>,
): Promise<void> {
	const path = commandPathFor('memberships');
	const url = `${getServerUrl()}${path}${membershipId === null ? '' : `/${membershipId}`}`;
	const txid = await writeCommand(url, method, body, 'Unable to send the invitation.');

	await Promise.all([awaitTxIdOn(memberships(), txid), awaitTxIdOn(profiles(), txid)]);
}

/**
 * The Electric adapter's txid wait, off a collection whose `utils` is untyped.
 *
 * `utils` is declared as an index signature rather than a named set of members,
 * so a stricter shape here would not be assignable *from* a real collection even
 * though the member exists on one. Reading it back out is where the shape is
 * asserted, once.
 */
async function awaitTxIdOn(
	collection: { readonly subscriberCount: number; readonly utils: Record<string, unknown> },
	txid: number,
): Promise<void> {
	if (collection.subscriberCount === 0) {
		return;
	}
	const wait = collection.utils.awaitTxId as ((txId: number) => Promise<unknown>) | undefined;
	if (wait === undefined) {
		return;
	}

	try {
		await wait(txid);
	} catch (error) {
		// The server committed before this wait started, so a timeout is sync lag
		// rather than failure — the same judgement `settleWrite` makes for the
		// collection path. Every other rejection is real.
		if (!isTxIdConfirmationTimeout(error)) {
			throw error;
		}
	}
}

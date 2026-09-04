/**
 * The `memberships` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createMembershipsCollection, type Membership } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `eager`: The role ladder. The server is what enforces it, but the UI hides what a
 * Profile may not do, and it cannot do that a subset at a time.
 *
 * Writable since ADR 0013's last slice. Changing a role and ending a membership
 * are `identity.*` commands on `/commands/memberships`, applied as ordinary
 * optimistic updates — the row they move is one the client fully determines, and
 * the WorkOS half writes nothing a client receives.
 *
 * Inviting and re-inviting are not written through this collection at all. Both
 * settle whether a mail was delivered, which is the half the contract refuses an
 * optimistic row for, and an invitation writes a Profile beside the Membership.
 * `use-membership-mutations.ts` posts those two and waits on the txid here.
 */
export const memberships = declareCollection<Membership>({
	table: 'memberships',
	syncMode: 'eager',
	mutations: true,
	create: createMembershipsCollection,
});

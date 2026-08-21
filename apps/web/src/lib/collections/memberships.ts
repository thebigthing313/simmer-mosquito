/**
 * The `memberships` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createMembershipsCollection, type Membership } from '@simmer-mosquito/sync';
import { BasicIndex, type Collection } from '@tanstack/db';
import { syncClientOptions } from './client-options';

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
 *
 * The type is written here rather than inferred because a `Collection<…>`
 * instantiated inside `packages/sync` arrives as `any`, with no error to say so.
 * Naming it on this side instantiates it where it resolves.
 */
export const memberships: Collection<Membership, string | number> = createMembershipsCollection({
	...syncClientOptions,
	syncMode: 'eager',
	mutations: true,
});

/**
 * The join index.
 *
 * A live query that joins this table loads it lazily — it collects the join keys
 * the driving side produces and asks for exactly those rows. It can only do that
 * when the join column is indexed. Without this it says so in a console warning
 * and loads the whole table instead, which on an on-demand collection is the one
 * thing the mode exists to avoid.
 *
 * Always `id`: every table is joined by its primary key, because that is what the
 * foreign keys point at.
 */
memberships.createIndex((row) => row.id, { indexType: BasicIndex });

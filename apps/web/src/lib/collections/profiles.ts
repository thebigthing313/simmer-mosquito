/**
 * The `profiles` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createProfilesCollection, type Profile } from '@simmer-mosquito/sync';
import { BasicIndex, type Collection } from '@tanstack/db';
import { getServerUrl } from '../../auth';

/**
 * `eager`: Who an agency's people are. Every record that names an inspector, applicator
 * or crew member resolves through this.
 *
 * `mutations: true` since ADR 0013's first slice: `/commands/profiles` exists,
 * and creating or editing a Profile is `identity.createProfile` and
 * `identity.updateProfile` through `mutateCollection` like every other table.
 * Attaching or ending a login is not: an invitation and an offboarding span
 * WorkOS, and they are still REST on `memberships`.
 *
 * The type is written here rather than inferred because a `Collection<…>`
 * instantiated inside `packages/sync` arrives as `any`, with no error to say so.
 * Naming it on this side instantiates it where it resolves.
 */
export const profiles: Collection<Profile, string | number> = createProfilesCollection({
	serverUrl: getServerUrl(),
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
profiles.createIndex((row) => row.id, { indexType: BasicIndex });

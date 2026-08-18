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
 * `mutations: false`, and as on `organizations` that does not mean this app does
 * not write it. A Profile is written by REST — `/organization/profiles` — because
 * identity writes are not commands and cannot become them (#130). There is no
 * `/commands/profiles`, so declaring no handlers is what makes a stray
 * `profiles.update(...)` a refusal rather than a request to an endpoint that does
 * not exist. `hooks/mutations/use-profile-mutations.ts` opens the transaction
 * that is the only way in.
 *
 * The type is written here rather than inferred because a `Collection<…>`
 * instantiated inside `packages/sync` arrives as `any`, with no error to say so.
 * Naming it on this side instantiates it where it resolves.
 */
export const profiles: Collection<Profile, string | number> = createProfilesCollection({
	serverUrl: getServerUrl(),
	syncMode: 'eager',
	mutations: false,
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

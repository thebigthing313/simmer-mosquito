/**
 * The `profiles` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createProfilesCollection, type Profile } from '@simmer-mosquito/sync';
import { declareCollection } from './registry';

/**
 * `eager`: Who an agency's people are. Every record that names an inspector, applicator
 * or crew member resolves through this.
 *
 * `mutations: true` since ADR 0013's first slice: `/commands/profiles` exists,
 * and creating or editing a Profile is `identity.createProfile` and
 * `identity.updateProfile` through `mutateCollection` like every other table.
 * Attaching or ending a login is not: an invitation and an offboarding span
 * WorkOS, and they are still REST on `memberships`.
 */
export const profiles = declareCollection<Profile>({
	table: 'profiles',
	syncMode: 'eager',
	mutations: true,
	create: createProfilesCollection,
});

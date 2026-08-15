/**
 * The `habitats` collection.
 *
 * How the table streams and whether this app may write to it are the app's
 * decisions rather than the table's — see `SyncCollectionClientOptions` in
 * `packages/sync` for why a schema cannot answer either.
 */

import { createHabitatsCollection, type Habitat } from '@simmer-mosquito/sync';
import { BasicIndex, type Collection } from '@tanstack/db';
import { getServerUrl } from '../../auth';

/**
 * `on-demand`: An agency's habitats grow without bound, so live queries fetch the subsets
 * they ask for rather than the table streaming whole before first paint.
 *
 * This app writes habitats, so the collection carries the three mutation
 * handlers and every write through it names the command it means.
 *
 * The type is written here rather than inferred because a `Collection<…>`
 * instantiated inside `packages/sync` arrives as `any`, with no error to say so.
 * Naming it on this side instantiates it where it resolves.
 */
export const habitats: Collection<Habitat, string | number> = createHabitatsCollection({
	serverUrl: getServerUrl(),
	syncMode: 'on-demand',
	mutations: true,
});

// The habitat pickers on the control-action and inspection forms.
habitats.createIndex((row) => row.habitat_name, { indexType: BasicIndex });

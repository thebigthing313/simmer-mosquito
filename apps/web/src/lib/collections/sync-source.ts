/**
 * The source the running app installs: an Electric-backed collection per table.
 *
 * It is the only thing that knows the server URL, so a table module has none to
 * reach for and every collection is built from the same options. That used to
 * be checked by reading all fifty modules as text looking for one that had
 * assembled its own; it is now the shape of {@link CollectionDeclaration}.
 *
 * `main.tsx` calls {@link installSyncCollections} before the first render.
 * Nothing else does, which is what keeps a hook importable without a network.
 */

import { syncClientOptions } from './client-options';
import { type CollectionSource, installCollections } from './registry';

const syncCollectionSource: CollectionSource = {
	build: (declaration) =>
		declaration.create({
			...syncClientOptions,
			syncMode: declaration.syncMode,
			mutations: declaration.mutations,
		}),
};

export function installSyncCollections(): void {
	installCollections(syncCollectionSource);
}

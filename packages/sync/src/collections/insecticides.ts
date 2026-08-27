/**
 * The `insecticides` collection.
 *
 * Generated, and there is nothing table-specific below the schema import: what one
 * table differs by is either declared in its schema or chosen by the client
 * calling this. See `functions/sync-collection.ts` for what is shared, and
 * `pnpm generate:schemas` before editing this by hand.
 */

import { createCollection } from '@tanstack/db';
import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { shapePathFor } from './functions/routes.js';
import {
	type SyncCollectionClientOptions,
	syncCollectionConfig,
} from './functions/sync-collection.js';
import { type Insecticide, insecticideSchema } from './tables/insecticides.js';

/**
 * The row, re-exported here so a consumer needs one import rather than reaching
 * past the collection into the schema module for the type of what it holds.
 */
export type { Insecticide };

/** Where this table's shape is served. Derived so client and server cannot drift. */
export const insecticidesShapePath = shapePathFor('insecticides');

export function createInsecticidesCollection(options: SyncCollectionClientOptions) {
	// The schema is passed here rather than through `syncCollectionConfig` because it
	// has to be concrete for the row type to be inferred from it — see that module.
	return createCollection(
		electricCollectionOptions({
			...syncCollectionConfig<Insecticide>({ table: 'insecticides', ...options }),
			schema: insecticideSchema,
		}),
	);
}

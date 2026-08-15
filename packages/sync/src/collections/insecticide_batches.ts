/**
 * The `insecticide_batches` collection.
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
import { type InsecticideBatch, insecticideBatchSchema } from './tables/insecticide_batches.js';

/** Where this table's shape is served. Derived so client and server cannot drift. */
export const insecticideBatchesShapePath = shapePathFor('insecticide_batches');

export function createInsecticideBatchesCollection(options: SyncCollectionClientOptions) {
	// The schema is passed here rather than through `syncCollectionConfig` because it
	// has to be concrete for the row type to be inferred from it — see that module.
	return createCollection(
		electricCollectionOptions({
			...syncCollectionConfig<InsecticideBatch>({ table: 'insecticide_batches', ...options }),
			schema: insecticideBatchSchema,
		}),
	);
}

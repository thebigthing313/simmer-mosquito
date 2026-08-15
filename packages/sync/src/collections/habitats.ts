/**
 * The habitats collection, defined plainly.
 *
 * No descriptor, no shared options factory — everything this collection is sits
 * in this file so the whole shape of one table can be read in one place.
 *
 * Field names are the Postgres column names, unchanged. Electric already streams
 * snake_case (the server forces the column list upstream), so leaving it alone
 * means no `columnMapper`, and the predicates a live query pushes down as subset
 * requests compile to SQL that needs no identifier rewriting.
 */

import { createCollection } from '@tanstack/db';
import { electricCollectionOptions } from '@tanstack/electric-db-collection';
import { shapePathFor } from './functions/routes.js';
import {
	type SyncCollectionClientOptions,
	syncCollectionConfig,
} from './functions/sync-collection.js';
import { type Habitat, habitatSchema } from './tables/habitats.js';

/**
 * Where this table's shape is served.
 *
 * `/sync/shapes/*` is a SIMMER convention, not something Electric or TanStack DB
 * knows about — both only ever see a URL. The path is derived rather than written
 * so the server registering the route and the client requesting it cannot drift.
 */
export const habitatsShapePath = shapePathFor('habitats');

/**
 * `serverUrl` is a parameter rather than a constant because this package has no
 * environment to read: the frontends talk to the API cross-origin and each one
 * resolves its own base URL.
 *
 * There is nothing habitat-specific left below. That a habitat must have a
 * geometry, that a new one may not already be retired, that only some columns are
 * a client's to state — all of it is enforced by the domain builders the endpoint
 * runs, and none of it is repeated here. What remains is the table, its shape, and
 * where its commands are posted.
 */
export function createHabitatsCollection(options: SyncCollectionClientOptions) {
	return createCollection(
		// The schema is passed here rather than through `syncCollectionConfig` because
		// it has to be concrete for the row type to be inferred from it — see that
		// module's comment. No explicit type parameter for the same reason: passing
		// both a generic and a schema is a documented anti-pattern.
		electricCollectionOptions({
			...syncCollectionConfig<Habitat>({ table: 'habitats', ...options }),
			schema: habitatSchema,
			getKey: (row) => row.id,
		}),
	);
}

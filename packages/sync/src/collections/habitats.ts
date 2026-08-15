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
import { z } from 'zod';
import { shapePathFor } from './functions/routes.js';
import {
	type SyncCollectionClientOptions,
	syncCollectionConfig,
} from './functions/sync-collection.js';

/**
 * Where this table's shape is served.
 *
 * `/sync/shapes/*` is a SIMMER convention, not something Electric or TanStack DB
 * knows about — both only ever see a URL. The path is derived rather than written
 * so the server registering the route and the client requesting it cannot drift.
 */
export const habitatsShapePath = shapePathFor('habitats');

/**
 * A habitat row as it arrives on the client — the `habitats` table, minus what
 * a client never receives.
 *
 * `geom` and `geojson` are absent on purpose: full geometry is served by the
 * `/map/*` endpoints and never streamed through a shape. What syncs is the
 * trigger-maintained centroid (`lat`, `lng`, `geom_type`).
 *
 * `deleted_at` and `deleted_by_profile_id` are absent too — the server's shape
 * predicate filters soft-deleted rows out upstream, so a deleted habitat never
 * reaches this collection.
 *
 * The schema validates the *mutation* path only — what `insert()` and `update()`
 * accept. Rows arriving over the shape stream bypass it; parsing those is
 * `shapeOptions.parser`'s job, and there is nothing to parse while every column
 * here is already a JSON primitive.
 */
export const habitatSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	lat: z.number(),
	lng: z.number(),
	geom_type: z.string(),
	address_id: z.uuid().nullable(),
	habitat_type_id: z.uuid().nullable(),
	habitat_name: z.string().nullable(),
	description: z.string(),
	is_active: z.boolean(),
	is_inaccessible: z.boolean(),
	// `JsonColumn` in the database is `unknown | null`; the domain narrows it to a
	// JSON object on the way in, but a row can carry whatever is already stored.
	metadata: z.unknown().nullable(),
	// The audit columns are stamped by the server inside the write transaction, so
	// a caller has nothing true to say about them. `.default()` rather than
	// `.optional()`: it drops them from the accepted input while keeping them
	// required on the stored row, which every synced habitat does carry. The
	// defaults only ever fill an optimistic row that the next sync replaces.
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	// Both columns are `timestamptz`, and Electric hands those over as ISO strings
	// rather than parsing them. `z.coerce.date()` covers the mutation path; the
	// `parser` below covers the sync path. Coercion rather than a bare `z.date()`
	// because `update()` hands the schema a draft that already holds a `Date`, so
	// the accepted input has to be a superset of the stored output.
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type Habitat = z.infer<typeof habitatSchema>;

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

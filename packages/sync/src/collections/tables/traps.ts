/**
 * The `traps` table, as a client receives it.
 *
 * Generated from the Kysely table type and the migrations, then owned by hand.
 * `geom`, `geojson`, `deleted_at` and `deleted_by_profile_id` are absent:
 * geometry is served by the `/map/*` endpoints, and the shape predicate filters
 * soft-deleted rows upstream, so neither ever reaches a collection.
 *
 * A `date` column is a `YYYY-MM-DD` string rather than a `Date` — see
 * `functions/sync-collection.ts` for why parsing one loses a day.
 */

import { z } from 'zod';

export const trapSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	lat: z.number(),
	lng: z.number(),
	geom_type: z.string(),
	collection_method_id: z.uuid(),
	address_id: z.uuid().nullable(),
	collection_lure_id: z.uuid().nullable(),
	trap_name: z.string().nullable(),
	trap_code: z.string().nullable(),
	description: z.string().nullable(),
	is_active: z.boolean(),
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type Trap = z.infer<typeof trapSchema>;

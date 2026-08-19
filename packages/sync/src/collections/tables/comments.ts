/**
 * The `comments` table, as a client receives it.
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

export const commentSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	entity_type: z.string(),
	entity_id: z.uuid(),
	comment_text: z.string(),
	commented_by_profile_id: z.uuid().nullable(),
	commented_at: z.coerce.date(),
	is_pinned: z.boolean(),
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type Comment = z.infer<typeof commentSchema>;

/**
 * The `users` table, as a client receives it.
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

export const userSchema = z.object({
	id: z.uuid(),
	workos_user_id: z.string(),
	email: z.string(),
	display_name: z.string(),
	first_name: z.string().nullable(),
	last_name: z.string().nullable(),
	email_verified: z.boolean().nullable(),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type User = z.infer<typeof userSchema>;

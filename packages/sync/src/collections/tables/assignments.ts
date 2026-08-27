/**
 * The `assignments` table, as a client receives it.
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

export const assignmentSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	assignment_name: z.string().nullable(),
	assigned_to_profile_id: z.uuid().nullable(),
	assigned_by_profile_id: z.uuid().nullable(),
	assignment_date: z.string(),
	due_at: z.coerce.date().nullable(),
	started_at: z.coerce.date().nullable(),
	completed_at: z.coerce.date().nullable(),
	cancelled_at: z.coerce.date().nullable(),
	cancellation_reason: z.string().nullable(),
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type Assignment = z.infer<typeof assignmentSchema>;

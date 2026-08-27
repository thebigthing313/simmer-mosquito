/**
 * The `mission_items` table, as a client receives it.
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

export const missionItemSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	mission_id: z.uuid(),
	requested_control_action_id: z.uuid().nullable(),
	lat: z.number(),
	lng: z.number(),
	geom_type: z.string(),
	address_id: z.uuid().nullable(),
	position: z.number(),
	completed_at: z.coerce.date().nullable(),
	completed_by_profile_id: z.string().nullable(),
	skipped_at: z.coerce.date().nullable(),
	skipped_by_profile_id: z.string().nullable(),
	skip_reason: z.string().nullable(),
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type MissionItem = z.infer<typeof missionItemSchema>;

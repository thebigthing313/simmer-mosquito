/**
 * The `requested_control_actions` table, as a client receives it.
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

export const requestedControlActionSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	control_type: z.enum(['application', 'source_reduction', 'biocontrol', 'outreach']),
	recommended_method_id: z.uuid().nullable(),
	summary: z.string().nullable(),
	habitat_id: z.uuid().nullable(),
	inspection_id: z.uuid().nullable(),
	collection_id: z.uuid().nullable(),
	lat: z.number(),
	lng: z.number(),
	geom_type: z.string(),
	address_id: z.uuid().nullable(),
	requested_by_profile_id: z.uuid().nullable(),
	requested_at: z.coerce.date(),
	resolved_at: z.coerce.date().nullable(),
	resolved_by_profile_id: z.uuid().nullable(),
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type RequestedControlAction = z.infer<typeof requestedControlActionSchema>;

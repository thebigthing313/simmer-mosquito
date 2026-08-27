/**
 * The `applications` table, as a client receives it.
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

export const applicationSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	application_method_id: z.uuid().nullable(),
	insecticide_id: z.uuid(),
	applicator_profile_id: z.uuid().nullable(),
	application_date: z.string(),
	lat: z.number(),
	lng: z.number(),
	geom_type: z.string(),
	address_id: z.uuid().nullable(),
	vehicle_id: z.uuid().nullable(),
	equipment_id: z.uuid().nullable(),
	amount_applied: z.number(),
	application_unit_id: z.uuid(),
	habitat_id: z.uuid().nullable(),
	collection_id: z.uuid().nullable(),
	inspection_id: z.uuid().nullable(),
	requested_control_action_id: z.uuid().nullable(),
	mission_item_id: z.string().nullable(),
	metadata: z.unknown().nullable(),
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type Application = z.infer<typeof applicationSchema>;

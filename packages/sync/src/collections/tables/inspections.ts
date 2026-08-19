/**
 * The `inspections` table, as a client receives it.
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

export const inspectionSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	lat: z.number(),
	lng: z.number(),
	geom_type: z.string(),
	habitat_id: z.uuid().nullable(),
	habitat_type_id: z.uuid().nullable(),
	address_id: z.uuid().nullable(),
	inspected_by_profile_id: z.uuid().nullable(),
	assignment_item_id: z.string().nullable(),
	inspection_date: z.string(),
	is_wet: z.boolean(),
	dip_count: z.number().nullable(),
	density: z.enum(['none', 'light', 'medium', 'heavy', 'very_heavy']).nullable(),
	larvae_count: z.number().nullable(),
	has_first_instar: z.boolean(),
	has_second_instar: z.boolean(),
	has_third_instar: z.boolean(),
	has_fourth_instar: z.boolean(),
	has_pupae: z.boolean(),
	has_eggs: z.boolean(),
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type Inspection = z.infer<typeof inspectionSchema>;

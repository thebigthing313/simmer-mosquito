/**
 * The `biocontrol_actions` table, as a client receives it.
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

export const biocontrolActionSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	biocontrol_method_id: z.uuid(),
	technician_profile_id: z.uuid().nullable(),
	biocontrol_date: z.string(),
	lat: z.number(),
	lng: z.number(),
	geom_type: z.string(),
	address_id: z.uuid().nullable(),
	habitat_id: z.uuid().nullable(),
	inspection_id: z.uuid().nullable(),
	amount_released: z.number(),
	release_unit_id: z.uuid(),
	requested_control_action_id: z.uuid().nullable(),
	mission_item_id: z.string().nullable(),
	metadata: z.unknown().nullable(),
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type BiocontrolAction = z.infer<typeof biocontrolActionSchema>;

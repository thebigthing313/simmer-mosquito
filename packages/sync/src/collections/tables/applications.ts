/**
 * The `applications` table, as a client receives it.
 *
 * Generated from the Kysely table type and the migrations, then owned by hand.
 * `geom`, `geojson`, `deleted_at` and `deleted_by_profile_id` are absent:
 * geometry is served by the `/map/*` endpoints, and the shape predicate filters
 * soft-deleted rows upstream, so neither ever reaches a collection.
 *
 * One Chemical Application: one Insecticide and one amount within a Treatment.
 * The visit (date, people, method, place, links and custom fields) is on the
 * Treatment that `treatment_id` names, and a row carries no geometry of its
 * own. `organization_id` is a copy of the Treatment's, kept for this shape's
 * scope, and the database refuses a copy that disagrees.
 *
 * A `date` column is a `YYYY-MM-DD` string rather than a `Date` — see
 * `functions/sync-collection.ts` for why parsing one loses a day.
 */

import { z } from 'zod';

export const applicationSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	treatment_id: z.uuid(),
	insecticide_id: z.uuid(),
	amount_applied: z.number(),
	application_unit_id: z.uuid(),
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type Application = z.infer<typeof applicationSchema>;

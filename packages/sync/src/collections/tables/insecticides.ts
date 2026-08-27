/**
 * The `insecticides` table, as a client receives it.
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

export const insecticideSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	trade_name: z.string(),
	active_ingredient: z.string(),
	is_active: z.boolean(),
	type: z.enum(['larvicide', 'adulticide', 'pupicide', 'other']),
	registration_number: z.string(),
	default_unit_id: z.uuid(),
	inventory_unit_id: z.uuid().nullable(),
	conversion_factor: z.number().nullable(),
	label_url: z.string().nullable(),
	msds_url: z.string().nullable(),
	shorthand: z.string().nullable(),
	metadata: z.unknown().nullable(),
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type Insecticide = z.infer<typeof insecticideSchema>;

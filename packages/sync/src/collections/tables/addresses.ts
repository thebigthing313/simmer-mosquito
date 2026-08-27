/**
 * The `addresses` table, as a client receives it.
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

export const addressSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	lat: z.number(),
	lng: z.number(),
	geom_type: z.string(),
	display_name: z.string(),
	country: z.string(),
	address_line_1: z.string().nullable(),
	address_line_2: z.string().nullable(),
	locality: z.string().nullable(),
	region: z.string().nullable(),
	postal_code: z.string().nullable(),
	geocoder_response: z.unknown().nullable(),
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type Address = z.infer<typeof addressSchema>;

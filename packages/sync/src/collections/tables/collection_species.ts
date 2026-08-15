/**
 * The `collection_species` table, as a client receives it.
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

export const collectionSpeciesSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	collection_id: z.uuid(),
	species_id: z.uuid(),
	count: z.number(),
	sex: z.enum(['male', 'female']).nullable(),
	status: z.enum(['damaged', 'unfed', 'bloodfed', 'gravid']).nullable(),
	identified_by_profile_id: z.uuid().nullable(),
	identified_date: z.string(),
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type CollectionSpecies = z.infer<typeof collectionSpeciesSchema>;

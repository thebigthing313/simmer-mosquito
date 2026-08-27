/**
 * The `collections` table, as a client receives it.
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

export const adultCollectionSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	trap_id: z.uuid().nullable(),
	collection_method_id: z.uuid(),
	collection_lure_id: z.uuid().nullable(),
	lat: z.number(),
	lng: z.number(),
	geom_type: z.string(),
	address_id: z.uuid().nullable(),
	collected_at: z.coerce.date().nullable(),
	collected_by_profile_id: z.uuid().nullable(),
	started_at: z.coerce.date().nullable(),
	set_by_profile_id: z.uuid().nullable(),
	set_assignment_item_id: z.string().nullable(),
	collected_assignment_item_id: z.string().nullable(),
	collection_timing_mode: z.enum(['exact_timestamps', 'collection_date_duration']),
	collection_date: z.string().nullable(),
	duration_amount: z.number().nullable(),
	duration_unit_id: z.string().nullable(),
	has_problem: z.boolean(),
	is_zero_result: z.boolean(),
	has_bycatch: z.boolean(),
	metadata: z.unknown().nullable(),
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type AdultCollection = z.infer<typeof adultCollectionSchema>;

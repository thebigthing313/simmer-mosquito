/**
 * The `units` table, as a client receives it.
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

export const unitSchema = z.object({
	id: z.uuid(),
	code: z.string(),
	unit_name: z.string(),
	abbreviation: z.string(),
	unit_type: z.enum([
		'weight',
		'distance',
		'area',
		'volume',
		'temperature',
		'duration',
		'count',
		'speed',
	]),
	unit_system: z.enum(['si', 'imperial', 'us_customary']),
	created_at: z.coerce.date().default(() => new Date()),
});

export type Unit = z.infer<typeof unitSchema>;

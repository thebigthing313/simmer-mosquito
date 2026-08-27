/**
 * The `weather_summaries` table, as a client receives it.
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

export const weatherSummarySchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid().nullable(),
	weather_source_id: z.uuid(),
	start_date: z.string(),
	end_date: z.string(),
	temperature_min_f: z.number().nullable(),
	temperature_max_f: z.number().nullable(),
	precipitation_inches: z.number().nullable(),
	relative_humidity_min: z.number().nullable(),
	relative_humidity_max: z.number().nullable(),
	wind_speed_min_mph: z.number().nullable(),
	wind_speed_max_mph: z.number().nullable(),
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type WeatherSummary = z.infer<typeof weatherSummarySchema>;

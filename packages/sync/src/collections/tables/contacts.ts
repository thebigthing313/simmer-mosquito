/**
 * The `contacts` table, as a client receives it.
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

export const contactSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	contact_name: z.string().nullable(),
	preferred_phone: z.string().nullable(),
	alternate_phone: z.string().nullable(),
	email: z.string().nullable(),
	company: z.string().nullable(),
	department: z.string().nullable(),
	title: z.string().nullable(),
	wants_email: z.boolean(),
	wants_sms: z.boolean(),
	wants_phone: z.boolean(),
	metadata: z.unknown().nullable(),
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type Contact = z.infer<typeof contactSchema>;

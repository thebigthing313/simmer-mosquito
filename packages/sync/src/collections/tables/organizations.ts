/**
 * The `organizations` table, as a client receives it.
 *
 * Generated from the Kysely table type and the migrations, then owned by hand.
 * `geom`, `geojson`, `deleted_at` and `deleted_by_profile_id` are absent:
 * geometry is served by the `/map/*` endpoints, and the shape predicate filters
 * soft-deleted rows upstream, so neither ever reaches a collection.
 *
 * This table withholds `subscription_status`, `billing_mode`,
 * `billing_contact_name`, `billing_contact_email`, `subscription_notes` as
 * well. They are the operator's view of an agency rather than the agency's
 * own record. They are written and read in the operator console
 * (`apps/admin`), which reaches them over REST; `subscription_notes` in
 * particular is what operators write *about* an agency. An agency that
 * should see its own subscription state is a product decision to make
 * deliberately, not a column to leave streaming by default. Say so in
 * `WITHHELD` in `scripts/withheld-columns.mjs`, never by deleting a
 * line below — that lasts until the next regeneration, and the drift check
 * reads the same list.
 *
 * A `date` column is a `YYYY-MM-DD` string rather than a `Date` — see
 * `functions/sync-collection.ts` for why parsing one loses a day.
 */

import { z } from 'zod';

export const organizationSchema = z.object({
	id: z.uuid(),
	workos_organization_id: z.string().nullable(),
	name: z.string(),
	slug: z.string().nullable(),
	settings: z.unknown().nullable(),
	main_contact_email: z.string().nullable(),
	phone_number: z.string().nullable(),
	mailing_country: z.string().nullable(),
	mailing_address_line_1: z.string().nullable(),
	mailing_address_line_2: z.string().nullable(),
	mailing_locality: z.string().nullable(),
	mailing_region: z.string().nullable(),
	mailing_postal_code: z.string().nullable(),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
	updated_by_profile_id: z.uuid().nullable().default(null),
});

export type Organization = z.infer<typeof organizationSchema>;

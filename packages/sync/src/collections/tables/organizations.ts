/**
 * The `organizations` table, as a client receives it.
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

export const organizationSchema = z.object({
	id: z.uuid(),
	workos_organization_id: z.string().nullable(),
	name: z.string(),
	slug: z.string().nullable(),
	settings: z.unknown().nullable(),
	subscription_status: z.enum(['trial', 'active', 'suspended', 'canceled']),
	billing_mode: z.enum(['manual_invoice']),
	billing_contact_name: z.string().nullable(),
	billing_contact_email: z.string().nullable(),
	subscription_notes: z.string().nullable(),
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

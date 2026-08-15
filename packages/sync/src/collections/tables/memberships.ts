/**
 * The `memberships` table, as a client receives it.
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

export const membershipSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	user_id: z.uuid().nullable(),
	profile_id: z.uuid(),
	role: z.enum(['owner', 'admin', 'manager', 'collector', 'viewer']),
	status: z.enum(['active', 'inactive', 'invited']),
	is_default: z.boolean(),
	invited_email: z.string().nullable(),
	workos_invitation_id: z.string().nullable(),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type Membership = z.infer<typeof membershipSchema>;

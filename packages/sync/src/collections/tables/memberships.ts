/**
 * The `memberships` table, as a client receives it.
 *
 * Generated from the Kysely table type and the migrations, then owned by hand.
 * `geom`, `geojson`, `deleted_at` and `deleted_by_profile_id` are absent:
 * geometry is served by the `/map/*` endpoints, and the shape predicate filters
 * soft-deleted rows upstream, so neither ever reaches a collection.
 *
 * This table withholds `invited_email`, `workos_invitation_id` as well. They
 * are an invited address and the handle on a live WorkOS invitation, and the
 * `memberships` shape is eager for every signed-in organization user down to
 * a viewer. The shape is eager because of the role ladder, which is a reason
 * for `role`, `status` and `profile_id` and not for these two: an invited
 * address is the private contact detail of somebody who has not accepted
 * yet, and `workos_invitation_id` is a handle on a grant in the second
 * system. The handlers that need them read them server-side inside the
 * transaction, and the operator console reads them over REST. Say so in
 * `WITHHELD` in `scripts/withheld-columns.mjs`, never by deleting a line
 * below: `pnpm check:schemas` refuses a field list that is not the one that
 * file generates, and the drift check reads the same list.
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
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type Membership = z.infer<typeof membershipSchema>;

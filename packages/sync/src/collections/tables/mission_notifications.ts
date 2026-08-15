/**
 * The `mission_notifications` table, as a client receives it.
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

export const missionNotificationSchema = z.object({
	id: z.uuid(),
	organization_id: z.uuid(),
	mission_id: z.uuid(),
	notification_registration_id: z.uuid(),
	contact_id: z.uuid(),
	notification_type_id: z.uuid(),
	channel: z.enum(['email', 'sms', 'phone']),
	destination: z.string().nullable(),
	status: z.enum(['pending', 'completed', 'failed', 'skipped']),
	status_changed_at: z.coerce.date().nullable(),
	status_changed_by_profile_id: z.uuid().nullable(),
	created_by_profile_id: z.uuid().nullable().default(null),
	updated_by_profile_id: z.uuid().nullable().default(null),
	created_at: z.coerce.date().default(() => new Date()),
	updated_at: z.coerce.date().default(() => new Date()),
});

export type MissionNotification = z.infer<typeof missionNotificationSchema>;

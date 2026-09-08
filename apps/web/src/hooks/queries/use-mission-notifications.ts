/**
 * Who has been told about one mission.
 *
 * Read beside the Generate button so an empty answer is legible: a second press
 * creating nothing is correct when the list is already full, and the list is the
 * only thing that says which of the two happened.
 *
 * `mission_notifications` is on-demand, so this uses the status-gated
 * `useLiveQuery` rather than the suspense variant, which sticks after a
 * navigation unmount over an on-demand collection.
 */

import type { MissionNotificationStatus, NotificationChannel } from '@simmer-mosquito/domain';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { mission_notifications } from '../../lib/collections/mission_notifications';
import { mapCardGcTimeMs, unmatchableId } from './shared';

/** One notification, as the mission page reads it. */
export interface MissionNotificationRecord {
	readonly id: string;
	readonly contactId: string;
	readonly notificationRegistrationId: string;
	readonly channel: NotificationChannel;
	readonly destination: string | null;
	readonly status: MissionNotificationStatus;
	readonly createdAt: Date;
}

export function useMissionNotifications(missionId: string | null | undefined): {
	readonly notifications: readonly MissionNotificationRecord[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const id = missionId ?? unmatchableId;

	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ notification: mission_notifications() })
					.where(({ notification }) => eq(notification.mission_id, id))
					.select(({ notification }) => ({
						id: notification.id,
						contactId: notification.contact_id,
						notificationRegistrationId: notification.notification_registration_id,
						channel: notification.channel,
						destination: notification.destination,
						status: notification.status,
						createdAt: notification.created_at,
					})),
		},
		[id],
	);

	return {
		notifications: result.data,
		isReady: result.isReady,
		isError: result.isError,
	};
}

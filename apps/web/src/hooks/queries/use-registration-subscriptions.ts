import { eq, useLiveQuery } from '@tanstack/react-db';
import { notification_registration_types } from '../../lib/collections/notification_registration_types';
import { mapCardGcTimeMs, unmatchableId } from './shared';
import type { RegistrationSubscriptionRecord } from './use-registration-record';
/** The notification types one registration subscribes to. */
export function useRegistrationSubscriptions(registrationId: string | null | undefined): {
	readonly subscriptions: readonly RegistrationSubscriptionRecord[];
	readonly isReady: boolean;
} {
	const id = registrationId ?? unmatchableId;

	const result = useLiveQuery({
		gcTime: mapCardGcTimeMs,
		query: (query) =>
			query
				.from({ link: notification_registration_types() })
				.where(({ link }) => eq(link.notification_registration_id, id))
				.select(({ link }) => ({
					id: link.id,
					notificationTypeId: link.notification_type_id,
				})),
	});

	return { subscriptions: result.data, isReady: result.isReady };
}

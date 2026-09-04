/**
 * One notification registration, and the types it subscribes to.
 *
 * Two queries rather than one join, because the subscriptions are a list and a
 * join would repeat the registration once per row. The detail page and the edit
 * form both want the pair, and both want the list separately from the record.
 *
 * `notification_registrations` is on-demand, so these use the status-gated
 * `useLiveQuery` rather than the suspense variant, which sticks after a
 * navigation unmount over an on-demand collection.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { notification_registration_types } from '../../lib/collections/notification_registration_types';
import { notification_registrations } from '../../lib/collections/notification_registrations';
import { mapCardGcTimeMs, unmatchableId } from './shared';

/** A registration as every surface reads one. */
export interface RegistrationRecord {
	readonly id: string;
	readonly contactId: string;
	readonly addressId: string | null;
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
	readonly bufferDistance: number | null;
	readonly bufferUnitId: string | null;
	readonly hasBees: boolean;
	readonly isNoSpray: boolean;
	readonly isActive: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/** One link row: which type this registration wants telling about. */
export interface RegistrationSubscriptionRecord {
	readonly id: string;
	readonly notificationTypeId: string;
}

export function useRegistration(registrationId: string | null | undefined): {
	readonly registration: RegistrationRecord | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const id = registrationId ?? unmatchableId;

	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ registration: notification_registrations() })
					.where(({ registration }) => eq(registration.id, id))
					.select(({ registration }) => ({
						id: registration.id,
						contactId: registration.contact_id,
						addressId: registration.address_id,
						lat: registration.lat,
						lng: registration.lng,
						geomType: registration.geom_type,
						bufferDistance: registration.buffer_distance,
						bufferUnitId: registration.buffer_unit_id,
						hasBees: registration.has_bees,
						isNoSpray: registration.is_no_spray,
						isActive: registration.is_active,
						createdAt: registration.created_at,
						updatedAt: registration.updated_at,
					})),
		},
		[id],
	);

	return { registration: result.data[0], isReady: result.isReady, isError: result.isError };
}

export function useRegistrationSubscriptions(registrationId: string | null | undefined): {
	readonly subscriptions: readonly RegistrationSubscriptionRecord[];
	readonly isReady: boolean;
} {
	const id = registrationId ?? unmatchableId;

	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ link: notification_registration_types() })
					.where(({ link }) => eq(link.notification_registration_id, id))
					.select(({ link }) => ({
						id: link.id,
						notificationTypeId: link.notification_type_id,
					})),
		},
		[id],
	);

	return { subscriptions: result.data, isReady: result.isReady };
}

import { notification_registrations } from '../../lib/collections/notification_registrations';
import { useRecordById } from './shared';

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

/** One notification registration by id, through the on-demand record read. */
export function useRegistration(registrationId: string | null | undefined): {
	readonly registration: RegistrationRecord | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useRecordById({
		collection: notification_registrations(),
		id: registrationId ?? null,
		query: (query) =>
			query.select(({ record: registration }) => ({
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
	});

	return { registration: result.record, isReady: result.isReady, isError: result.isError };
}

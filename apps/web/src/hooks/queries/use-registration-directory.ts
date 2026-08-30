/**
 * Every notification registration the agency holds.
 *
 * The whole set rather than a viewport page, because the explorer draws each
 * one's buffer and a registration whose centre is off screen can still cover
 * what is on it. A mile of buffer reaches a long way past the point it is drawn
 * from, so a bbox-filtered read would hide exactly the coverage an operator
 * planning a mission needs to see.
 *
 * `notification_registrations` is on-demand, so this uses the status-gated
 * `useLiveQuery` rather than the suspense variant, which sticks after a
 * navigation unmount over an on-demand collection.
 */

import { useLiveQuery } from '@tanstack/react-db';
import { notification_registrations } from '../../lib/collections/notification_registrations';

/** A registration as the explorer reads one: where it is, and what it covers. */
export interface RegistrationListing {
	readonly id: string;
	readonly contactId: string;
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
	readonly bufferDistance: number | null;
	readonly bufferUnitId: string | null;
	readonly hasBees: boolean;
	readonly isNoSpray: boolean;
	readonly isActive: boolean;
}

export function useRegistrationDirectory(): {
	readonly registrations: readonly RegistrationListing[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery({
		query: (query) =>
			query.from({ registration: notification_registrations }).select(({ registration }) => ({
				id: registration.id,
				contactId: registration.contact_id,
				lat: registration.lat,
				lng: registration.lng,
				geomType: registration.geom_type,
				bufferDistance: registration.buffer_distance,
				bufferUnitId: registration.buffer_unit_id,
				hasBees: registration.has_bees,
				isNoSpray: registration.is_no_spray,
				isActive: registration.is_active,
			})),
	});

	return { registrations: result.data, isReady: result.isReady };
}

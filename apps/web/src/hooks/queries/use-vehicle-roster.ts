import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { vehicles } from '../../lib/collections/vehicles';
import type { RigListing } from './chemical-roster-view';

/** The organization's vehicles as an application form picks from them. */
export function useVehicleRoster(): readonly RigListing[] {
	return useLiveSuspenseQuery((query) =>
		query.from({ row: vehicles() }).select(({ row }) => ({
			id: row.id,
			name: row.vehicle_name,
			isActive: row.is_active,
		})),
	).data;
}

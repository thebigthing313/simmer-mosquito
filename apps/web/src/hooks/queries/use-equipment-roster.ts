import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { equipment as equipmentCollection } from '../../lib/collections/equipment';
import type { RigListing } from './chemical-roster-view';

/** The organization's equipment as an application form picks from it. */
export function useEquipmentRoster(): readonly RigListing[] {
	return useLiveSuspenseQuery((query) =>
		query.from({ row: equipmentCollection() }).select(({ row }) => ({
			id: row.id,
			name: row.equipment_name,
			isActive: row.is_active,
		})),
	).data;
}

import { eq, useLiveSuspenseQuery } from '@tanstack/react-db';
import { equipment } from '../../lib/collections/equipment';
import type { ControlAssetRecord } from './control-asset-record-view';

/** The organization's equipment on one side of the lifecycle split, in name order. */
export function useEquipmentHalf(isActive: boolean): readonly ControlAssetRecord[] {
	return useLiveSuspenseQuery((query) =>
		query
			.from({ row: equipment() })
			.where(({ row }) => eq(row.is_active, isActive))
			.orderBy(({ row }) => row.equipment_name, 'asc')
			.select(({ row }) => ({
				id: row.id,
				name: row.equipment_name,
				serialNumber: row.serial_number,
				metadata: row.metadata,
				isActive: row.is_active,
			})),
	).data;
}

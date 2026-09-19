import { eq, useLiveSuspenseQuery } from '@tanstack/react-db';
import { vehicles } from '../../lib/collections/vehicles';
import type { ControlAssetRecord } from './control-asset-record-view';

/** The organization's vehicles on one side of the lifecycle split, in name order. */
export function useVehicleHalf(isActive: boolean): readonly ControlAssetRecord[] {
	return useLiveSuspenseQuery((query) =>
		query
			.from({ row: vehicles() })
			.where(({ row }) => eq(row.is_active, isActive))
			.orderBy(({ row }) => row.vehicle_name, 'asc')
			.select(({ row }) => ({
				id: row.id,
				name: row.vehicle_name,
				// A literal rather than a column, so the two records are one shape
				// and the page never asks which table a row came from.
				serialNumber: null as string | null,
				metadata: row.metadata,
				isActive: row.is_active,
			})),
	).data;
}

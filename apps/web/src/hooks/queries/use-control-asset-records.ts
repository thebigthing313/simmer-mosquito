/**
 * Vehicles and equipment, as the settings page maintains them.
 *
 * Two tables the agency owns that are not quite catalogs — an application names a
 * vehicle and a piece of equipment, but neither carries a custom schema and both
 * carry a free-form `metadata` bag instead. They differ from each other in two
 * columns: the name column's spelling, and a serial number equipment has and a
 * vehicle does not.
 *
 * That difference is resolved here rather than in the page. The old code carried
 * a `VehicleRow | EquipmentRow` union all the way to the table cell and asked
 * `isEquipmentRow(asset)` to decide what to render, which meant every consumer
 * had to know both spellings. One record shape with `serialNumber: null` on a
 * vehicle says the same thing once.
 */

import { eq, useLiveSuspenseQuery } from '@tanstack/react-db';
import { equipment } from '../../lib/collections/equipment';
import { vehicles } from '../../lib/collections/vehicles';
import type { CatalogRecords } from './use-catalog-records';

/** A vehicle or a piece of equipment, as the list and the drawer read one. */
export interface ControlAssetRecord {
	readonly id: string;
	readonly name: string;
	/** Always `null` for a vehicle — the column is equipment's alone. */
	readonly serialNumber: string | null;
	readonly metadata: unknown;
	readonly isActive: boolean;
}

export function useVehicleRecords(): CatalogRecords<ControlAssetRecord> {
	return {
		activeRecords: useVehicleHalf(true),
		inactiveRecords: useVehicleHalf(false),
	};
}

function useVehicleHalf(isActive: boolean): readonly ControlAssetRecord[] {
	return useLiveSuspenseQuery(
		(query) =>
			query
				.from({ row: vehicles })
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
		[isActive],
	).data;
}

export function useEquipmentRecords(): CatalogRecords<ControlAssetRecord> {
	return {
		activeRecords: useEquipmentHalf(true),
		inactiveRecords: useEquipmentHalf(false),
	};
}

function useEquipmentHalf(isActive: boolean): readonly ControlAssetRecord[] {
	return useLiveSuspenseQuery(
		(query) =>
			query
				.from({ row: equipment })
				.where(({ row }) => eq(row.is_active, isActive))
				.orderBy(({ row }) => row.equipment_name, 'asc')
				.select(({ row }) => ({
					id: row.id,
					name: row.equipment_name,
					serialNumber: row.serial_number,
					metadata: row.metadata,
					isActive: row.is_active,
				})),
		[isActive],
	).data;
}

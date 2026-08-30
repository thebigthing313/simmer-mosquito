/**
 * Writing the agency's vehicles and equipment.
 *
 * The same five commands the lookup catalogs answer to, so the writes themselves
 * come from `catalog-writes.ts`; only the columns differ. A vehicle is a name and
 * a metadata bag, equipment adds a serial number.
 *
 * The lifecycle is a command here too. The old PATCH read `is_active` for its
 * direction, so a client could only say where the row should end up and the
 * server had to work out what that meant.
 *
 * These sit at the `MANAGER` floor, unlike the lookup catalogs — every one of
 * `controlOperations.createVehicle` through `deleteEquipment`. Vehicles and
 * equipment are part of running the work rather than configuring the agency.
 */

import type { Equipment, Vehicle } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { equipment } from '../../lib/collections/equipment';
import { vehicles } from '../../lib/collections/vehicles';
import { useAuthSnapshot } from '../use-auth-snapshot';
import {
	type CatalogCommandNames,
	createCatalogRow,
	deleteCatalogRow,
	saveCatalogRow,
	setCatalogRowActive,
} from './catalog-writes';
import { newRecordId, optimisticStamp } from './shared';

/** A vehicle or a piece of equipment as its drawer holds one. */
export interface ControlAssetFields {
	readonly name: string;
	/** Ignored by the vehicle hook: the column is equipment's alone. */
	readonly serialNumber: string | null;
	readonly metadata: unknown;
	readonly isActive: boolean;
}

export interface ControlAssetMutations {
	readonly create: (fields: ControlAssetFields) => Promise<string>;
	/**
	 * Save an edited asset.
	 *
	 * `acknowledgements` is what the user has answered, keyed by the flag the
	 * endpoint reads. The two hooks read different keys — `/commands/vehicles` and
	 * `/commands/equipment` each take their own, unlike the older per-kind REST
	 * route that fanned one name out to both — so the caller passes everything it
	 * has and the hook picks its own.
	 */
	readonly save: (
		id: string,
		fields: ControlAssetFields,
		current: ControlAssetFields,
		acknowledgements?: Readonly<Record<string, boolean>>,
	) => Promise<void>;
	readonly setActive: (id: string, isActive: boolean) => Promise<void>;
	readonly remove: (id: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

const vehicleCommands: CatalogCommandNames = {
	create: 'controlOperations.createVehicle',
	update: 'controlOperations.updateVehicle',
	deactivate: 'controlOperations.deactivateVehicle',
	reactivate: 'controlOperations.reactivateVehicle',
	remove: 'controlOperations.deleteVehicle',
};

export function useVehicleMutations(): ControlAssetMutations {
	const { organizationId, actorProfileId } = useAssetWriterIdentity();

	const create = useCallback(
		async (fields: ControlAssetFields) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}
			const now = optimisticStamp();
			const row = {
				id: newRecordId(),
				organization_id: organizationId,
				vehicle_name: fields.name,
				metadata: fields.metadata,
				is_active: fields.isActive,
				created_by_profile_id: actorProfileId,
				updated_by_profile_id: actorProfileId,
				created_at: now,
				updated_at: now,
			} satisfies Vehicle;
			await createCatalogRow(vehicles, vehicleCommands, row);
			return row.id;
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(
		async (
			id: string,
			fields: ControlAssetFields,
			current: ControlAssetFields,
			acknowledgements: Readonly<Record<string, boolean>> = {},
		) => {
			const changes: Partial<Vehicle> = {};
			if (fields.name !== current.name) {
				changes.vehicle_name = fields.name;
			}
			if (fields.metadata !== current.metadata) {
				changes.metadata = fields.metadata;
			}
			await saveCatalogRow(vehicles, vehicleCommands, id, {
				changes,
				isActive: fields.isActive,
				wasActive: current.isActive,
				// An application names the vehicle it was made from and keeps no copy
				// of what it was called, so the rename is the only thing this save can
				// be refused over. The metadata is notes.
				...(changes.vehicle_name === undefined
					? {}
					: {
							acknowledgements: {
								acknowledgedHistoricalVehicleLabelChange:
									acknowledgements.acknowledgedHistoricalVehicleLabelChange === true,
							},
						}),
			});
		},
		[],
	);

	return {
		create,
		save,
		setActive: (id, isActive) => setCatalogRowActive(vehicles, vehicleCommands, id, isActive),
		remove: (id) => deleteCatalogRow(vehicles, vehicleCommands, id),
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}

const equipmentCommands: CatalogCommandNames = {
	create: 'controlOperations.createEquipment',
	update: 'controlOperations.updateEquipment',
	deactivate: 'controlOperations.deactivateEquipment',
	reactivate: 'controlOperations.reactivateEquipment',
	remove: 'controlOperations.deleteEquipment',
};

export function useEquipmentMutations(): ControlAssetMutations {
	const { organizationId, actorProfileId } = useAssetWriterIdentity();

	const create = useCallback(
		async (fields: ControlAssetFields) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}
			const now = optimisticStamp();
			const row = {
				id: newRecordId(),
				organization_id: organizationId,
				equipment_name: fields.name,
				serial_number: fields.serialNumber,
				metadata: fields.metadata,
				is_active: fields.isActive,
				created_by_profile_id: actorProfileId,
				updated_by_profile_id: actorProfileId,
				created_at: now,
				updated_at: now,
			} satisfies Equipment;
			await createCatalogRow(equipment, equipmentCommands, row);
			return row.id;
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(
		async (
			id: string,
			fields: ControlAssetFields,
			current: ControlAssetFields,
			acknowledgements: Readonly<Record<string, boolean>> = {},
		) => {
			const changes: Partial<Equipment> = {};
			if (fields.name !== current.name) {
				changes.equipment_name = fields.name;
			}
			if (fields.serialNumber !== current.serialNumber) {
				changes.serial_number = fields.serialNumber;
			}
			if (fields.metadata !== current.metadata) {
				changes.metadata = fields.metadata;
			}
			await saveCatalogRow(equipment, equipmentCommands, id, {
				changes,
				isActive: fields.isActive,
				wasActive: current.isActive,
				// The name and the serial number are both what a past application is
				// read back under, so either one is the question. The metadata is notes.
				...(changes.equipment_name === undefined && changes.serial_number === undefined
					? {}
					: {
							acknowledgements: {
								acknowledgedHistoricalEquipmentLabelChange:
									acknowledgements.acknowledgedHistoricalEquipmentLabelChange === true,
							},
						}),
			});
		},
		[],
	);

	return {
		create,
		save,
		setActive: (id, isActive) => setCatalogRowActive(equipment, equipmentCommands, id, isActive),
		remove: (id) => deleteCatalogRow(equipment, equipmentCommands, id),
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}

function useAssetWriterIdentity(): {
	readonly organizationId: string | null;
	readonly actorProfileId: string | null;
} {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	return {
		organizationId: identity?.organizationId ?? null,
		actorProfileId: identity?.profileId ?? null,
	};
}

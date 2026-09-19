import type { CatalogCommandNames } from './catalog-writes';

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

export const vehicleCommands: CatalogCommandNames = {
	create: 'controlOperations.createVehicle',
	update: 'controlOperations.updateVehicle',
	deactivate: 'controlOperations.deactivateVehicle',
	reactivate: 'controlOperations.reactivateVehicle',
	remove: 'controlOperations.deleteVehicle',
};

export const equipmentCommands: CatalogCommandNames = {
	create: 'controlOperations.createEquipment',
	update: 'controlOperations.updateEquipment',
	deactivate: 'controlOperations.deactivateEquipment',
	reactivate: 'controlOperations.reactivateEquipment',
	remove: 'controlOperations.deleteEquipment',
};

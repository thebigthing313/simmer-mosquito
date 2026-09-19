import type { Vehicle } from '@simmer-mosquito/sync';
import { vehicles } from '../../lib/collections/vehicles';
import {
	createCatalogRow,
	deleteCatalogRow,
	saveCatalogRow,
	setCatalogRowActive,
} from './catalog-writes';
import {
	type ControlAssetFields,
	type ControlAssetMutations,
	vehicleCommands,
} from './control-asset-fields';
import { canAttributeWrite, newRecordId, optimisticStamp } from './shared';
import { useWriterIdentity } from './use-writer-identity';

/** The five catalog writes for vehicles: create, save, deactivate, reactivate and delete. */
export function useVehicleMutations(): ControlAssetMutations {
	const { organizationId, actorProfileId } = useWriterIdentity();

	const create = async (fields: ControlAssetFields) => {
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
		await createCatalogRow(vehicles(), vehicleCommands, row);
		return row.id;
	};

	const save = async (
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
		await saveCatalogRow(vehicles(), vehicleCommands, id, {
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
	};

	return {
		create,
		save,
		setActive: (id, isActive) => setCatalogRowActive(vehicles(), vehicleCommands, id, isActive),
		remove: (id) => deleteCatalogRow(vehicles(), vehicleCommands, id),
		canWrite: canAttributeWrite({ organization: organizationId, actorProfileId }),
	};
}

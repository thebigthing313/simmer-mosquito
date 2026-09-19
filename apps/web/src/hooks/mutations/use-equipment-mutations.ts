import type { Equipment } from '@simmer-mosquito/sync';
import { equipment } from '../../lib/collections/equipment';
import {
	createCatalogRow,
	deleteCatalogRow,
	saveCatalogRow,
	setCatalogRowActive,
} from './catalog-writes';
import {
	type ControlAssetFields,
	type ControlAssetMutations,
	equipmentCommands,
} from './control-asset-fields';
import { canAttributeWrite, newRecordId, optimisticStamp } from './shared';
import { useWriterIdentity } from './use-writer-identity';

/** The five catalog writes for equipment: create, save, deactivate, reactivate and delete. */
export function useEquipmentMutations(): ControlAssetMutations {
	const { organizationId, actorProfileId } = useWriterIdentity();

	const create = async (fields: ControlAssetFields) => {
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
		await createCatalogRow(equipment(), equipmentCommands, row);
		return row.id;
	};

	const save = async (
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
		await saveCatalogRow(equipment(), equipmentCommands, id, {
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
	};

	return {
		create,
		save,
		setActive: (id, isActive) => setCatalogRowActive(equipment(), equipmentCommands, id, isActive),
		remove: (id) => deleteCatalogRow(equipment(), equipmentCommands, id),
		canWrite: canAttributeWrite({ organization: organizationId, actorProfileId }),
	};
}

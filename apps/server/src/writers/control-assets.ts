import { assertRecordDeletable, type SelectedRow, sql } from '@simmer-mosquito/db';
import type {
	CreateEquipmentCommand,
	CreateVehicleCommand,
	DeactivateEquipmentCommand,
	DeactivateVehicleCommand,
	DeleteEquipmentCommand,
	DeleteVehicleCommand,
	ReactivateEquipmentCommand,
	ReactivateVehicleCommand,
	UpdateEquipmentCommand,
	UpdateVehicleCommand,
} from '@simmer-mosquito/domain';
import type { CommandTransaction } from '../command-write.js';
import { assertCitedHistoryAcknowledged } from '../record-history.js';

type ControlAssetTransaction = CommandTransaction;
export type ControlAssetCommand =
	| CreateVehicleCommand
	| UpdateVehicleCommand
	| DeactivateVehicleCommand
	| ReactivateVehicleCommand
	| DeleteVehicleCommand
	| CreateEquipmentCommand
	| UpdateEquipmentCommand
	| DeactivateEquipmentCommand
	| ReactivateEquipmentCommand
	| DeleteEquipmentCommand;

type ControlAssetRow =
	| SelectedRow<'vehicles', typeof vehicleReturnColumns>
	| SelectedRow<'equipment', typeof equipmentReturnColumns>;

export async function writeControlAssetCommand(
	db: ControlAssetTransaction,
	command: ControlAssetCommand,
): Promise<ControlAssetRow | null> {
	switch (command.type) {
		case 'controlOperations.createVehicle':
			return createVehicle(db, {
				id: command.payload.vehicleId,
				organizationId: command.payload.organizationId,
				name: command.payload.vehicleName,
				metadata: command.payload.metadata,
				isActive: true,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.updateVehicle':
			// A chemical application names the vehicle it was made from, and stores
			// no copy of what that vehicle was called, so a rename rewrites every
			// one of them. The metadata is notes, and asks nothing.
			await assertCitedHistoryAcknowledged(db, {
				recordType: 'vehicle',
				recordId: command.payload.vehicleId,
				organizationId: command.payload.organizationId,
				subject: 'vehicle',
				acknowledgement: 'acknowledgedHistoricalVehicleLabelChange',
				acknowledged: command.payload.acknowledgedHistoricalVehicleLabelChange,
				relabels: command.payload.changes.vehicleName !== undefined,
			});
			return updateVehicle(db, command.payload.vehicleId, {
				organizationId: command.payload.organizationId,
				...command.payload.changes,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.deactivateVehicle':
			return setVehicleActive(db, command.payload.vehicleId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: false,
			});
		case 'controlOperations.reactivateVehicle':
			return setVehicleActive(db, command.payload.vehicleId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: true,
			});
		case 'controlOperations.deleteVehicle':
			return deleteVehicle(db, command.payload.vehicleId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.createEquipment':
			return createEquipment(db, {
				id: command.payload.equipmentId,
				organizationId: command.payload.organizationId,
				name: command.payload.equipmentName,
				serialNumber: command.payload.serialNumber,
				metadata: command.payload.metadata,
				isActive: true,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.updateEquipment':
			// The equipment's name and its serial number are both what a past
			// application is read back under. The metadata is notes.
			await assertCitedHistoryAcknowledged(db, {
				recordType: 'equipment',
				recordId: command.payload.equipmentId,
				organizationId: command.payload.organizationId,
				subject: 'equipment record',
				acknowledgement: 'acknowledgedHistoricalEquipmentLabelChange',
				acknowledged: command.payload.acknowledgedHistoricalEquipmentLabelChange,
				relabels:
					command.payload.changes.equipmentName !== undefined ||
					command.payload.changes.serialNumber !== undefined,
			});
			return updateEquipment(db, command.payload.equipmentId, {
				organizationId: command.payload.organizationId,
				...command.payload.changes,
				actorProfileId: command.payload.actorProfileId,
			});
		case 'controlOperations.deactivateEquipment':
			return setEquipmentActive(db, command.payload.equipmentId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: false,
			});
		case 'controlOperations.reactivateEquipment':
			return setEquipmentActive(db, command.payload.equipmentId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				isActive: true,
			});
		case 'controlOperations.deleteEquipment':
			return deleteEquipment(db, command.payload.equipmentId, {
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
			});
	}
}

interface ControlAssetWriteInput {
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly serialNumber?: string | null;
	readonly metadata: unknown | null;
	readonly isActive: boolean;
	readonly actorProfileId: string;
}

interface ControlAssetUpdateInput {
	readonly organizationId: string;
	readonly vehicleName?: string;
	readonly equipmentName?: string;
	readonly serialNumber?: string | null;
	readonly metadata?: unknown | null;
	readonly actorProfileId: string;
}

interface ControlAssetLifecycleInput {
	readonly organizationId: string;
	readonly actorProfileId: string;
}

async function createVehicle(
	db: ControlAssetTransaction,
	input: ControlAssetWriteInput,
): Promise<ControlAssetRow> {
	const row = await db
		.insertInto('vehicles')
		.values({
			id: input.id,
			organization_id: input.organizationId,
			vehicle_name: input.name,
			metadata: input.metadata,
			is_active: input.isActive,
			created_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
		})
		.returning(vehicleReturnColumns)
		.executeTakeFirstOrThrow();

	return row;
}

async function createEquipment(
	db: ControlAssetTransaction,
	input: ControlAssetWriteInput,
): Promise<ControlAssetRow> {
	const row = await db
		.insertInto('equipment')
		.values({
			id: input.id,
			organization_id: input.organizationId,
			equipment_name: input.name,
			serial_number: input.serialNumber ?? null,
			metadata: input.metadata,
			is_active: input.isActive,
			created_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
		})
		.returning(equipmentReturnColumns)
		.executeTakeFirstOrThrow();

	return row;
}

async function updateVehicle(
	db: ControlAssetTransaction,
	vehicleId: string,
	input: ControlAssetUpdateInput,
): Promise<ControlAssetRow | null> {
	const row = await db
		.updateTable('vehicles')
		.set({
			...(input.vehicleName === undefined ? {} : { vehicle_name: input.vehicleName }),
			...(input.metadata === undefined ? {} : { metadata: input.metadata }),
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', vehicleId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(vehicleReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

async function updateEquipment(
	db: ControlAssetTransaction,
	equipmentId: string,
	input: ControlAssetUpdateInput,
): Promise<ControlAssetRow | null> {
	const row = await db
		.updateTable('equipment')
		.set({
			...(input.equipmentName === undefined ? {} : { equipment_name: input.equipmentName }),
			...(input.serialNumber === undefined ? {} : { serial_number: input.serialNumber }),
			...(input.metadata === undefined ? {} : { metadata: input.metadata }),
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', equipmentId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(equipmentReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

async function setVehicleActive(
	db: ControlAssetTransaction,
	vehicleId: string,
	input: ControlAssetLifecycleInput & { readonly isActive: boolean },
): Promise<ControlAssetRow | null> {
	const row = await db
		.updateTable('vehicles')
		.set({
			is_active: input.isActive,
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', vehicleId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(vehicleReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

async function setEquipmentActive(
	db: ControlAssetTransaction,
	equipmentId: string,
	input: ControlAssetLifecycleInput & { readonly isActive: boolean },
): Promise<ControlAssetRow | null> {
	const row = await db
		.updateTable('equipment')
		.set({
			is_active: input.isActive,
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', equipmentId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(equipmentReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

async function deleteVehicle(
	db: ControlAssetTransaction,
	vehicleId: string,
	input: ControlAssetLifecycleInput,
): Promise<ControlAssetRow | null> {
	await assertRecordDeletable(db, {
		recordType: 'vehicle',
		recordId: vehicleId,
		organizationId: input.organizationId,
	});

	const row = await db
		.updateTable('vehicles')
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', vehicleId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(vehicleReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

async function deleteEquipment(
	db: ControlAssetTransaction,
	equipmentId: string,
	input: ControlAssetLifecycleInput,
): Promise<ControlAssetRow | null> {
	await assertRecordDeletable(db, {
		recordType: 'equipment',
		recordId: equipmentId,
		organizationId: input.organizationId,
	});

	const row = await db
		.updateTable('equipment')
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: input.actorProfileId,
			updated_by_profile_id: input.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', equipmentId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(equipmentReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

const vehicleReturnColumns = [
	'id',
	'organization_id',
	'vehicle_name',
	'metadata',
	'is_active',
	'created_at',
	'updated_at',
] as const;

const equipmentReturnColumns = [
	'id',
	'organization_id',
	'equipment_name',
	'serial_number',
	'metadata',
	'is_active',
	'created_at',
	'updated_at',
] as const;

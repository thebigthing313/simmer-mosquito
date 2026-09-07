import {
	createNamedReferenceCommand,
	namedReferenceIdCommand,
} from '../named-reference-commands.js';
import type { DomainId, JsonObject } from '../shared.js';
import {
	jsonObjectField,
	nullableTextField,
	requiredTextField,
	type UpdateFieldSet,
	type UpdateFieldsChanges,
	type UpdateFieldsInput,
	updateFieldsCommand,
} from '../update-command-fields.js';
import type {
	ControlCommandInput,
	ControlCommandPayload,
	ControlOperationsDomainCommand,
} from './core.js';
export interface CreateVehicleCommandInput extends ControlCommandInput {
	readonly vehicleId: DomainId;
	readonly vehicleName: string;
	readonly metadata?: unknown | null;
}

export type CreateVehicleCommand = ControlOperationsDomainCommand<
	'controlOperations.createVehicle',
	ControlCommandPayload & {
		readonly vehicleId: DomainId;
		readonly vehicleName: string;
		readonly metadata: JsonObject | null;
	}
>;

export const VEHICLE_UPDATE_FIELDS = {
	vehicleName: requiredTextField(200),
	metadata: jsonObjectField,
} satisfies UpdateFieldSet;

export type UpdateVehicleCommandInput = ControlCommandInput &
	UpdateFieldsInput<typeof VEHICLE_UPDATE_FIELDS> & {
		readonly vehicleId: DomainId;
		readonly acknowledgedHistoricalVehicleLabelChange?: boolean;
	};

export type UpdateVehicleCommand = ControlOperationsDomainCommand<
	'controlOperations.updateVehicle',
	ControlCommandPayload & {
		readonly vehicleId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof VEHICLE_UPDATE_FIELDS>;
		readonly acknowledgedHistoricalVehicleLabelChange: boolean;
	}
>;

export interface VehicleIdCommandInput extends ControlCommandInput {
	readonly vehicleId: DomainId;
}

export type DeactivateVehicleCommand = ControlOperationsDomainCommand<
	'controlOperations.deactivateVehicle',
	ControlCommandPayload & { readonly vehicleId: DomainId }
>;

export type ReactivateVehicleCommand = ControlOperationsDomainCommand<
	'controlOperations.reactivateVehicle',
	ControlCommandPayload & { readonly vehicleId: DomainId }
>;

export type DeleteVehicleCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteVehicle',
	ControlCommandPayload & { readonly vehicleId: DomainId }
>;

export interface CreateEquipmentCommandInput extends ControlCommandInput {
	readonly equipmentId: DomainId;
	readonly equipmentName: string;
	readonly serialNumber?: string | null;
	readonly metadata?: unknown | null;
}

export type CreateEquipmentCommand = ControlOperationsDomainCommand<
	'controlOperations.createEquipment',
	ControlCommandPayload & {
		readonly equipmentId: DomainId;
		readonly equipmentName: string;
		readonly serialNumber: string | null;
		readonly metadata: JsonObject | null;
	}
>;

export const EQUIPMENT_UPDATE_FIELDS = {
	equipmentName: requiredTextField(200),
	serialNumber: nullableTextField(500),
	metadata: jsonObjectField,
} satisfies UpdateFieldSet;

export type UpdateEquipmentCommandInput = ControlCommandInput &
	UpdateFieldsInput<typeof EQUIPMENT_UPDATE_FIELDS> & {
		readonly equipmentId: DomainId;
		readonly acknowledgedHistoricalEquipmentLabelChange?: boolean;
	};

export type UpdateEquipmentCommand = ControlOperationsDomainCommand<
	'controlOperations.updateEquipment',
	ControlCommandPayload & {
		readonly equipmentId: DomainId;
		readonly changes: UpdateFieldsChanges<typeof EQUIPMENT_UPDATE_FIELDS>;
		readonly acknowledgedHistoricalEquipmentLabelChange: boolean;
	}
>;

export interface EquipmentIdCommandInput extends ControlCommandInput {
	readonly equipmentId: DomainId;
}

export type DeactivateEquipmentCommand = ControlOperationsDomainCommand<
	'controlOperations.deactivateEquipment',
	ControlCommandPayload & { readonly equipmentId: DomainId }
>;

export type ReactivateEquipmentCommand = ControlOperationsDomainCommand<
	'controlOperations.reactivateEquipment',
	ControlCommandPayload & { readonly equipmentId: DomainId }
>;

export type DeleteEquipmentCommand = ControlOperationsDomainCommand<
	'controlOperations.deleteEquipment',
	ControlCommandPayload & { readonly equipmentId: DomainId }
>;

export function createVehicleCommand(input: CreateVehicleCommandInput): CreateVehicleCommand {
	const command = createNamedReferenceCommand({
		type: 'controlOperations.createVehicle',
		input: { ...input, name: input.vehicleName },
		idKey: 'vehicleId',
		fields: { metadata: true },
		message: 'Create vehicle command is invalid.',
	});
	const { name, ...payload } = command.payload;
	return {
		type: 'controlOperations.createVehicle',
		payload: { ...payload, vehicleName: name },
	};
}

export function updateVehicleCommand(input: UpdateVehicleCommandInput): UpdateVehicleCommand {
	const command = updateFieldsCommand({
		type: 'controlOperations.updateVehicle',
		input,
		idKey: 'vehicleId',
		fields: VEHICLE_UPDATE_FIELDS,
		changeNoun: 'vehicle',
		message: 'Update vehicle command is invalid.',
	});
	return {
		type: command.type,
		payload: {
			...command.payload,
			acknowledgedHistoricalVehicleLabelChange:
				input.acknowledgedHistoricalVehicleLabelChange ?? false,
		},
	};
}

export function deactivateVehicleCommand(input: VehicleIdCommandInput): DeactivateVehicleCommand {
	return namedReferenceIdCommand({
		type: 'controlOperations.deactivateVehicle',
		input,
		idKey: 'vehicleId',
	});
}

export function reactivateVehicleCommand(input: VehicleIdCommandInput): ReactivateVehicleCommand {
	return namedReferenceIdCommand({
		type: 'controlOperations.reactivateVehicle',
		input,
		idKey: 'vehicleId',
	});
}

export function deleteVehicleCommand(input: VehicleIdCommandInput): DeleteVehicleCommand {
	return namedReferenceIdCommand({
		type: 'controlOperations.deleteVehicle',
		input,
		idKey: 'vehicleId',
	});
}

export function createEquipmentCommand(input: CreateEquipmentCommandInput): CreateEquipmentCommand {
	const command = createNamedReferenceCommand({
		type: 'controlOperations.createEquipment',
		input: { ...input, name: input.equipmentName },
		idKey: 'equipmentId',
		fields: { serialNumber: true, metadata: true },
		message: 'Create equipment command is invalid.',
	});
	const { name, ...payload } = command.payload;
	return {
		type: 'controlOperations.createEquipment',
		payload: { ...payload, equipmentName: name },
	};
}

export function updateEquipmentCommand(input: UpdateEquipmentCommandInput): UpdateEquipmentCommand {
	const command = updateFieldsCommand({
		type: 'controlOperations.updateEquipment',
		input,
		idKey: 'equipmentId',
		fields: EQUIPMENT_UPDATE_FIELDS,
		changeNoun: 'equipment',
		message: 'Update equipment command is invalid.',
	});
	return {
		type: command.type,
		payload: {
			...command.payload,
			acknowledgedHistoricalEquipmentLabelChange:
				input.acknowledgedHistoricalEquipmentLabelChange ?? false,
		},
	};
}

export function deactivateEquipmentCommand(
	input: EquipmentIdCommandInput,
): DeactivateEquipmentCommand {
	return namedReferenceIdCommand({
		type: 'controlOperations.deactivateEquipment',
		input,
		idKey: 'equipmentId',
	});
}

export function reactivateEquipmentCommand(
	input: EquipmentIdCommandInput,
): ReactivateEquipmentCommand {
	return namedReferenceIdCommand({
		type: 'controlOperations.reactivateEquipment',
		input,
		idKey: 'equipmentId',
	});
}

export function deleteEquipmentCommand(input: EquipmentIdCommandInput): DeleteEquipmentCommand {
	return namedReferenceIdCommand({
		type: 'controlOperations.deleteEquipment',
		input,
		idKey: 'equipmentId',
	});
}

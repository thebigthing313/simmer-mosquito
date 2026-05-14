import {
	createNamedReferenceCommand,
	namedReferenceIdCommand,
	updateNamedReferenceCommand,
} from '../named-reference-commands.js';
import type { DomainId, JsonObject } from '../shared.js';
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

export interface UpdateVehicleCommandInput extends ControlCommandInput {
	readonly vehicleId: DomainId;
	readonly vehicleName?: string;
	readonly metadata?: unknown | null;
	readonly acknowledgedHistoricalVehicleLabelChange?: boolean;
}

export type UpdateVehicleCommand = ControlOperationsDomainCommand<
	'controlOperations.updateVehicle',
	ControlCommandPayload & {
		readonly vehicleId: DomainId;
		readonly changes: Readonly<{
			readonly vehicleName?: string;
			readonly metadata?: JsonObject | null;
		}>;
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

export interface UpdateEquipmentCommandInput extends ControlCommandInput {
	readonly equipmentId: DomainId;
	readonly equipmentName?: string;
	readonly serialNumber?: string | null;
	readonly metadata?: unknown | null;
	readonly acknowledgedHistoricalEquipmentLabelChange?: boolean;
}

export type UpdateEquipmentCommand = ControlOperationsDomainCommand<
	'controlOperations.updateEquipment',
	ControlCommandPayload & {
		readonly equipmentId: DomainId;
		readonly changes: Readonly<{
			readonly equipmentName?: string;
			readonly serialNumber?: string | null;
			readonly metadata?: JsonObject | null;
		}>;
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
	const command = updateNamedReferenceCommand({
		type: 'controlOperations.updateVehicle',
		input: {
			...input,
			...(input.vehicleName !== undefined ? { name: input.vehicleName } : {}),
			...(input.acknowledgedHistoricalVehicleLabelChange !== undefined
				? {
						acknowledgedHistoricalLabelChange: input.acknowledgedHistoricalVehicleLabelChange,
					}
				: {}),
		},
		idKey: 'vehicleId',
		fields: { metadata: true },
		changeNoun: 'vehicle',
		message: 'Update vehicle command is invalid.',
	});
	const { changes, acknowledgedHistoricalLabelChange, ...payload } = command.payload;
	const { name, ...remainingChanges } = changes;
	return {
		type: 'controlOperations.updateVehicle',
		payload: {
			...payload,
			changes: {
				...(name !== undefined ? { vehicleName: name } : {}),
				...remainingChanges,
			},
			acknowledgedHistoricalVehicleLabelChange: acknowledgedHistoricalLabelChange,
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
	const command = updateNamedReferenceCommand({
		type: 'controlOperations.updateEquipment',
		input: {
			...input,
			...(input.equipmentName !== undefined ? { name: input.equipmentName } : {}),
			...(input.acknowledgedHistoricalEquipmentLabelChange !== undefined
				? {
						acknowledgedHistoricalLabelChange: input.acknowledgedHistoricalEquipmentLabelChange,
					}
				: {}),
		},
		idKey: 'equipmentId',
		fields: { serialNumber: true, metadata: true },
		changeNoun: 'equipment',
		message: 'Update equipment command is invalid.',
	});
	const { changes, acknowledgedHistoricalLabelChange, ...payload } = command.payload;
	const { name, ...remainingChanges } = changes;
	return {
		type: 'controlOperations.updateEquipment',
		payload: {
			...payload,
			changes: {
				...(name !== undefined ? { equipmentName: name } : {}),
				...remainingChanges,
			},
			acknowledgedHistoricalEquipmentLabelChange: acknowledgedHistoricalLabelChange,
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

/**
 * The `vehicles` and `equipment` tables, as commands.
 *
 * Ten commands. The old surface was `POST /control-assets/:kind` with the same
 * `requireKind` middleware and `switch (kind)` builders as the method catalogs —
 * see `control-methods.ts` for why that indirection is gone.
 *
 * Written out per table rather than through a factory, unlike the four method
 * catalogs: these two only look alike. A vehicle has a name, equipment has a
 * name and a serial number, the name columns are spelled differently
 * (`vehicle_name`, `equipment_name`), and each carries its own
 * label-change acknowledgement. Sharing them would mean a parameter for every
 * one of those, which is a longer way of writing the same two maps.
 *
 * ## Field names
 *
 * Postgres column names: `vehicle_name`, `equipment_name`, `serial_number`,
 * `metadata`.
 */

import {
	createEquipmentCommand,
	createVehicleCommand,
	deactivateEquipmentCommand,
	deactivateVehicleCommand,
	deleteEquipmentCommand,
	deleteVehicleCommand,
	reactivateEquipmentCommand,
	reactivateVehicleCommand,
	updateEquipmentCommand,
	updateVehicleCommand,
} from '@simmer-mosquito/domain';
import { readNullableText, readText } from '../command-payload.js';
import type { CommandDb, RunCommandsConfig } from '../command-write.js';
import { type ControlAssetCommand, writeControlAssetCommand } from '../control-asset-commands.js';
import type { TableCommands } from './dispatch.js';
import { acknowledged } from './shared.js';

type AssetResponse = NonNullable<Awaited<ReturnType<typeof writeControlAssetCommand>>>;

/** Both tables answer through the same writer, so both share its `run`. */
function assetRun(db: CommandDb): RunCommandsConfig<ControlAssetCommand, AssetResponse> {
	return {
		db,
		write: async (trx, command) => await writeControlAssetCommand(trx, command),
		notFound: 'control_asset_not_found',
		key: 'asset',
	};
}

export function vehicleTableCommands(
	db: CommandDb,
): TableCommands<'vehicles', ControlAssetCommand, AssetResponse> {
	return {
		table: 'vehicles',
		run: assetRun(db),
		intents: {
			'controlOperations.createVehicle': ({ payload, organization, id }) =>
				createVehicleCommand({
					...organization,
					vehicleId: id,
					vehicleName: readText(payload.vehicle_name) ?? '',
					metadata: payload.metadata ?? null,
				}),

			'controlOperations.updateVehicle': ({ payload, organization, id }) =>
				updateVehicleCommand({
					...organization,
					vehicleId: id,
					...(payload.vehicle_name !== undefined
						? { vehicleName: readText(payload.vehicle_name) ?? '' }
						: {}),
					...(payload.metadata !== undefined ? { metadata: payload.metadata ?? null } : {}),
					acknowledgedHistoricalVehicleLabelChange: acknowledged(
						payload,
						'acknowledgedHistoricalVehicleLabelChange',
					),
				}),

			// `is_active` is a column a client can watch change; which way it moved is
			// the command's to say. The old PATCH read the boolean for its direction.
			'controlOperations.deactivateVehicle': ({ organization, id }) =>
				deactivateVehicleCommand({ ...organization, vehicleId: id }),

			'controlOperations.reactivateVehicle': ({ organization, id }) =>
				reactivateVehicleCommand({ ...organization, vehicleId: id }),

			'controlOperations.deleteVehicle': ({ organization, id }) =>
				deleteVehicleCommand({ ...organization, vehicleId: id }),
		},
	};
}

export function equipmentTableCommands(
	db: CommandDb,
): TableCommands<'equipment', ControlAssetCommand, AssetResponse> {
	return {
		table: 'equipment',
		run: assetRun(db),
		intents: {
			'controlOperations.createEquipment': ({ payload, organization, id }) =>
				createEquipmentCommand({
					...organization,
					equipmentId: id,
					equipmentName: readText(payload.equipment_name) ?? '',
					serialNumber: readNullableText(payload.serial_number),
					metadata: payload.metadata ?? null,
				}),

			'controlOperations.updateEquipment': ({ payload, organization, id }) =>
				updateEquipmentCommand({
					...organization,
					equipmentId: id,
					...(payload.equipment_name !== undefined
						? { equipmentName: readText(payload.equipment_name) ?? '' }
						: {}),
					// Present-and-null clears the serial number; absent leaves it. A piece
					// of equipment can genuinely lose the label it was tracked by.
					...(payload.serial_number !== undefined
						? { serialNumber: readNullableText(payload.serial_number) }
						: {}),
					...(payload.metadata !== undefined ? { metadata: payload.metadata ?? null } : {}),
					acknowledgedHistoricalEquipmentLabelChange: acknowledged(
						payload,
						'acknowledgedHistoricalEquipmentLabelChange',
					),
				}),

			'controlOperations.deactivateEquipment': ({ organization, id }) =>
				deactivateEquipmentCommand({ ...organization, equipmentId: id }),

			'controlOperations.reactivateEquipment': ({ organization, id }) =>
				reactivateEquipmentCommand({ ...organization, equipmentId: id }),

			'controlOperations.deleteEquipment': ({ organization, id }) =>
				deleteEquipmentCommand({ ...organization, equipmentId: id }),
		},
	};
}

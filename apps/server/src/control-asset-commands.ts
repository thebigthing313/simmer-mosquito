import { assertRecordDeletable, type SelectedRow, sql } from '@simmer-mosquito/db';
import {
	type CreateEquipmentCommand,
	type CreateVehicleCommand,
	createEquipmentCommand,
	createVehicleCommand,
	type DeactivateEquipmentCommand,
	type DeactivateVehicleCommand,
	type DeleteEquipmentCommand,
	type DeleteVehicleCommand,
	DomainValidationError,
	deactivateEquipmentCommand,
	deactivateVehicleCommand,
	deleteEquipmentCommand,
	deleteVehicleCommand,
	type ReactivateEquipmentCommand,
	type ReactivateVehicleCommand,
	reactivateEquipmentCommand,
	reactivateVehicleCommand,
	type UpdateEquipmentCommand,
	type UpdateVehicleCommand,
	updateEquipmentCommand,
	updateVehicleCommand,
} from '@simmer-mosquito/domain';
import type { Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';
import {
	agencyCommandContext,
	type CommandContext,
	type CommandsResult,
	commandEndpoint,
	createCommand,
	invalidUpdate,
	type PayloadResult,
} from './command-endpoint.js';
import { acknowledged, isRecord } from './command-payload.js';
import { type CommandDb, type CommandTransaction, runCommands } from './command-write.js';
import { assertCitedHistoryAcknowledged } from './record-history.js';

type ControlAssetDb = CommandDb;
type ControlAssetTransaction = CommandTransaction;
type ControlAssetKind = 'vehicles' | 'equipment';
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

export function registerControlAssetCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: ControlAssetDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	// The kind is checked before the body is read, so an unknown catalog answers
	// 404 whatever the payload looks like.
	const requireKind: MiddlewareHandler<{ Variables: AuthVariables }> = async (context, next) => {
		if (!readKind(context.req.param('kind') ?? '').ok) {
			return context.json({ error: 'asset_kind_not_found' }, 404);
		}
		await next();
	};

	const run = (
		context: CommandContext,
		commands: readonly ControlAssetCommand[],
		createdStatus?: 201,
	) =>
		runCommands(
			context,
			{
				db: options.db,
				write: async (trx, command) => await writeControlAssetCommand(trx, command),
				notFound: 'control_asset_not_found',
				key: 'asset',
			},
			commands,
			createdStatus,
		);

	app.post(
		'/control-assets/:kind',
		options.authContextMiddleware,
		requireKind,
		commandEndpoint({
			readPayload: readAssetPayload,
			build: ({ payload, authContext, param }) =>
				buildCreateCommand(requiredKind(param('kind')), authContext, payload),
			run: (context, commands) => run(context, commands, 201),
		}),
	);

	app.patch(
		'/control-assets/:kind/:assetId',
		options.authContextMiddleware,
		requireKind,
		commandEndpoint({
			readPayload: readAssetPayload,
			build: ({ payload, authContext, param }) =>
				buildUpdateCommands(requiredKind(param('kind')), authContext, param('assetId'), payload),
			run,
		}),
	);

	app.delete(
		'/control-assets/:kind/:assetId',
		options.authContextMiddleware,
		requireKind,
		commandEndpoint({
			body: 'none',
			build: ({ authContext, param }) =>
				buildDeleteCommand(requiredKind(param('kind')), authContext, param('assetId')),
			run,
		}),
	);
}

/** Past `requireKind`, the path segment is one of the two. */
function requiredKind(value: string): ControlAssetKind {
	const kind = readKind(value);
	if (!kind.ok) {
		throw new Error(`Unhandled control asset kind ${value}.`);
	}
	return kind.kind;
}

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

function buildCreateCommand(
	kind: ControlAssetKind,
	authContext: AuthContext,
	payload: ControlAssetPayload,
): ControlAssetCommand {
	const context = agencyCommandContext(authContext);
	if (kind === 'vehicles') {
		return createVehicleCommand({
			...context,
			vehicleId: payload.id,
			vehicleName: payload.vehicleName,
			metadata: payload.metadata,
		});
	}

	return createEquipmentCommand({
		...context,
		equipmentId: payload.id,
		equipmentName: payload.equipmentName,
		...(payload.serialNumber === undefined ? {} : { serialNumber: payload.serialNumber }),
		metadata: payload.metadata,
	});
}

function buildUpdateCommands(
	kind: ControlAssetKind,
	authContext: AuthContext,
	assetId: string,
	payload: ControlAssetPayload,
): CommandsResult<ControlAssetCommand> {
	const commands: ControlAssetCommand[] = [];
	const context = agencyCommandContext(authContext);
	const hasDetailChange =
		payload.vehicleName !== undefined ||
		payload.equipmentName !== undefined ||
		payload.serialNumber !== undefined ||
		payload.metadata !== undefined;

	if (hasDetailChange) {
		const commandResult = createCommand(() =>
			kind === 'vehicles'
				? updateVehicleCommand({
						...context,
						vehicleId: assetId,
						vehicleName: payload.vehicleName,
						metadata: payload.metadata,
						acknowledgedHistoricalVehicleLabelChange: payload.acknowledgedHistoricalLabelChange,
					})
				: updateEquipmentCommand({
						...context,
						equipmentId: assetId,
						equipmentName: payload.equipmentName,
						...(payload.serialNumber === undefined ? {} : { serialNumber: payload.serialNumber }),
						metadata: payload.metadata,
						acknowledgedHistoricalEquipmentLabelChange: payload.acknowledgedHistoricalLabelChange,
					}),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (payload.isActive !== undefined) {
		const commandResult = createCommand(() =>
			kind === 'vehicles'
				? payload.isActive
					? reactivateVehicleCommand({ ...context, vehicleId: assetId })
					: deactivateVehicleCommand({ ...context, vehicleId: assetId })
				: payload.isActive
					? reactivateEquipmentCommand({ ...context, equipmentId: assetId })
					: deactivateEquipmentCommand({ ...context, equipmentId: assetId }),
		);
		if (!commandResult.ok) {
			return commandResult;
		}
		commands.push(commandResult.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('control asset');
	}

	return { ok: true, commands };
}

function buildDeleteCommand(
	kind: ControlAssetKind,
	authContext: AuthContext,
	assetId: string,
): ControlAssetCommand {
	const context = agencyCommandContext(authContext);
	return kind === 'vehicles'
		? deleteVehicleCommand({ ...context, vehicleId: assetId })
		: deleteEquipmentCommand({ ...context, equipmentId: assetId });
}

interface ControlAssetPayload {
	readonly id: string;
	readonly vehicleName: string;
	readonly equipmentName: string;
	readonly serialNumber?: string | null;
	readonly metadata?: unknown | null;
	readonly isActive?: boolean;
	readonly acknowledgedHistoricalLabelChange: boolean;
}

/**
 * One flag for both kinds, because the endpoint is one route with a kind in the
 * path and the caller sends whichever name matches the record it is editing.
 * The domain splits it back into the vehicle and equipment flags on the way in.
 */
function readLabelAcknowledgement(raw: Record<string, unknown>): boolean {
	const stated = raw.acknowledgedHistoricalVehicleLabelChange;
	return acknowledged(
		raw,
		stated === undefined || stated === null
			? 'acknowledgedHistoricalEquipmentLabelChange'
			: 'acknowledgedHistoricalVehicleLabelChange',
	);
}

function readAssetPayload(raw: Record<string, unknown>): PayloadResult<ControlAssetPayload> {
	if (raw.isActive !== undefined && typeof raw.isActive !== 'boolean') {
		return invalidPayload('isActive must be a boolean.');
	}

	return {
		ok: true,
		payload: {
			id: readRequiredText(raw.id) ?? '',
			vehicleName: readRequiredText(raw.vehicleName) ?? '',
			equipmentName: readRequiredText(raw.equipmentName) ?? '',
			...(raw.serialNumber === undefined
				? {}
				: { serialNumber: readOptionalText(raw.serialNumber) }),
			...(raw.metadata === undefined ? {} : { metadata: readOptionalJson(raw.metadata) }),
			...(raw.isActive === undefined ? {} : { isActive: raw.isActive }),
			acknowledgedHistoricalLabelChange: readLabelAcknowledgement(raw),
		},
	};
}

function readKind(
	value: string,
): { readonly ok: true; readonly kind: ControlAssetKind } | { readonly ok: false } {
	return value === 'vehicles' || value === 'equipment' ? { ok: true, kind: value } : { ok: false };
}

function readRequiredText(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}

	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function readOptionalText(value: unknown): string | null {
	return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readOptionalJson(value: unknown): unknown | null {
	return value === undefined ? null : value;
}

function invalidPayload(reason: string): PayloadResult<never> {
	return { ok: false, reason };
}

async function readCurrentTransactionId(db: ControlAssetTransaction): Promise<number> {
	const result = await sql<{
		txid: string;
	}>`select pg_current_xact_id()::xid::text as txid`.execute(db);
	const txid = result.rows[0]?.txid;
	if (txid === undefined) {
		throw new Error('Unable to read current transaction id.');
	}

	return Number.parseInt(txid, 10);
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

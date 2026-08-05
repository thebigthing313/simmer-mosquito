import {
	type Kysely,
	type MutationWriteResult,
	type SimmerDatabase,
	sql,
	type Transaction,
} from '@simmer-mosquito/db';
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
import { denyUnauthorizedAgencyCommands } from './command-permissions.js';

type ControlAssetDb = Kysely<SimmerDatabase>;
type ControlAssetTransaction = Transaction<SimmerDatabase>;
type ControlAssetKind = 'vehicles' | 'equipment';
type ControlAssetCommand =
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

interface SafeControlAsset {
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly serialNumber: string | null;
	readonly metadata: unknown | null;
	readonly isActive: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function registerControlAssetCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: {
		readonly db: ControlAssetDb;
		readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
	},
): void {
	app.post('/control-assets/:kind', options.authContextMiddleware, async (context) => {
		const kindResult = readKind(context.req.param('kind'));
		if (!kindResult.ok) {
			return context.json({ error: 'asset_kind_not_found' }, 404);
		}

		const payloadResult = await readAssetPayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const commandResult = createCommand(() =>
			buildCreateCommand(kindResult.kind, context.get('authContext'), payloadResult.payload),
		);
		if (!commandResult.ok) {
			return context.json(commandResult.body, 400);
		}

		const denial = denyUnauthorizedAgencyCommands(context, [commandResult.command]);
		if (denial !== null) {
			return denial;
		}

		const result = await writeControlAssetCommands(options.db, [commandResult.command]);
		return context.json({ asset: toControlAssetResponse(result.row), txid: result.txid }, 201);
	});

	app.patch('/control-assets/:kind/:assetId', options.authContextMiddleware, async (context) => {
		const kindResult = readKind(context.req.param('kind'));
		if (!kindResult.ok) {
			return context.json({ error: 'asset_kind_not_found' }, 404);
		}

		const payloadResult = await readAssetPayload(context.req);
		if (!payloadResult.ok) {
			return context.json({ error: 'invalid_payload', reason: payloadResult.reason }, 400);
		}

		const commandsResult = buildUpdateCommands(
			kindResult.kind,
			context.get('authContext'),
			context.req.param('assetId'),
			payloadResult.payload,
		);
		if (!commandsResult.ok) {
			return context.json(commandsResult.body, 400);
		}

		const denial = denyUnauthorizedAgencyCommands(context, commandsResult.commands);
		if (denial !== null) {
			return denial;
		}

		const result = await writeControlAssetCommands(options.db, commandsResult.commands);
		if (result.row === null) {
			return context.json({ error: 'control_asset_not_found' }, 404);
		}

		return context.json({ asset: toControlAssetResponse(result.row), txid: result.txid });
	});

	app.delete('/control-assets/:kind/:assetId', options.authContextMiddleware, async (context) => {
		const kindResult = readKind(context.req.param('kind'));
		if (!kindResult.ok) {
			return context.json({ error: 'asset_kind_not_found' }, 404);
		}

		const commandResult = createCommand(() =>
			buildDeleteCommand(kindResult.kind, context.get('authContext'), context.req.param('assetId')),
		);
		if (!commandResult.ok) {
			return context.json(commandResult.body, 400);
		}

		const denial = denyUnauthorizedAgencyCommands(context, [commandResult.command]);
		if (denial !== null) {
			return denial;
		}

		const result = await writeControlAssetCommands(options.db, [commandResult.command]);
		if (result.row === null) {
			return context.json({ error: 'control_asset_not_found' }, 404);
		}

		return context.json({ asset: toControlAssetResponse(result.row), txid: result.txid });
	});
}

async function writeControlAssetCommands(
	db: ControlAssetDb,
	commands: readonly ControlAssetCommand[],
): Promise<MutationWriteResult<SafeControlAsset | null>> {
	return db.transaction().execute(async (trx) => {
		let row: SafeControlAsset | null = null;
		for (const command of commands) {
			row = await writeControlAssetCommand(trx, command);
		}
		const txid = await readCurrentTransactionId(trx);
		return { row, txid };
	});
}

async function writeControlAssetCommand(
	db: ControlAssetTransaction,
	command: ControlAssetCommand,
): Promise<SafeControlAsset | null> {
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
): Promise<SafeControlAsset> {
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

	return toSafeVehicle(row);
}

async function createEquipment(
	db: ControlAssetTransaction,
	input: ControlAssetWriteInput,
): Promise<SafeControlAsset> {
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

	return toSafeEquipment(row);
}

async function updateVehicle(
	db: ControlAssetTransaction,
	vehicleId: string,
	input: ControlAssetUpdateInput,
): Promise<SafeControlAsset | null> {
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

	return row === undefined ? null : toSafeVehicle(row);
}

async function updateEquipment(
	db: ControlAssetTransaction,
	equipmentId: string,
	input: ControlAssetUpdateInput,
): Promise<SafeControlAsset | null> {
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

	return row === undefined ? null : toSafeEquipment(row);
}

async function setVehicleActive(
	db: ControlAssetTransaction,
	vehicleId: string,
	input: ControlAssetLifecycleInput & { readonly isActive: boolean },
): Promise<SafeControlAsset | null> {
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

	return row === undefined ? null : toSafeVehicle(row);
}

async function setEquipmentActive(
	db: ControlAssetTransaction,
	equipmentId: string,
	input: ControlAssetLifecycleInput & { readonly isActive: boolean },
): Promise<SafeControlAsset | null> {
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

	return row === undefined ? null : toSafeEquipment(row);
}

async function deleteVehicle(
	db: ControlAssetTransaction,
	vehicleId: string,
	input: ControlAssetLifecycleInput,
): Promise<SafeControlAsset | null> {
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

	return row === undefined ? null : toSafeVehicle(row);
}

async function deleteEquipment(
	db: ControlAssetTransaction,
	equipmentId: string,
	input: ControlAssetLifecycleInput,
): Promise<SafeControlAsset | null> {
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

	return row === undefined ? null : toSafeEquipment(row);
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
):
	| { readonly ok: true; readonly commands: readonly ControlAssetCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
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
						acknowledgedHistoricalVehicleLabelChange: true,
					})
				: updateEquipmentCommand({
						...context,
						equipmentId: assetId,
						equipmentName: payload.equipmentName,
						...(payload.serialNumber === undefined ? {} : { serialNumber: payload.serialNumber }),
						metadata: payload.metadata,
						acknowledgedHistoricalEquipmentLabelChange: true,
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
		return invalidUpdateCommand('control asset');
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

function createCommand<TCommand extends ControlAssetCommand>(
	build: () => TCommand,
):
	| { readonly ok: true; readonly command: TCommand }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	try {
		return { ok: true, command: build() };
	} catch (error) {
		if (error instanceof DomainValidationError) {
			return {
				ok: false,
				body: {
					error: 'invalid_command',
					message: error.message,
					issues: error.issues,
				},
			};
		}

		throw error;
	}
}

type InvalidCommandBody = {
	readonly error: 'invalid_command';
	readonly message: string;
	readonly issues: readonly { readonly path: string; readonly message: string }[];
};

interface ControlAssetPayload {
	readonly id: string;
	readonly vehicleName: string;
	readonly equipmentName: string;
	readonly serialNumber?: string | null;
	readonly metadata?: unknown | null;
	readonly isActive?: boolean;
}

type PayloadResult<T> =
	| { readonly ok: true; readonly payload: T }
	| { readonly ok: false; readonly reason: string };

async function readAssetPayload(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<ControlAssetPayload>> {
	const rawResult = await readJsonObject(request);
	if (!rawResult.ok) {
		return rawResult;
	}
	const raw = rawResult.payload;
	if (raw.isActive !== undefined && typeof raw.isActive !== 'boolean') {
		return invalid('isActive must be a boolean.');
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
		},
	};
}

async function readJsonObject(request: {
	readonly json: () => Promise<unknown>;
}): Promise<PayloadResult<Record<string, unknown>>> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return invalid('Request body must be JSON.');
	}

	if (!isRecord(raw)) {
		return invalid('Request body must be an object.');
	}

	return { ok: true, payload: raw };
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

function invalid(reason: string): PayloadResult<never> {
	return { ok: false, reason };
}

function invalidUpdateCommand(changeNoun: string): {
	readonly ok: false;
	readonly body: InvalidCommandBody;
} {
	const message = `At least one ${changeNoun} field must change.`;
	return {
		ok: false,
		body: {
			error: 'invalid_command',
			message,
			issues: [{ path: 'changes', message }],
		},
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function agencyCommandContext(authContext: AuthContext) {
	return {
		organizationId: authContext.organization.id,
		actorProfileId: authContext.profile.id,
	};
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

function toSafeVehicle(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly vehicle_name: string;
	readonly metadata: unknown | null;
	readonly is_active: boolean;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeControlAsset {
	return {
		id: row.id,
		organizationId: row.organization_id,
		name: row.vehicle_name,
		serialNumber: null,
		metadata: row.metadata,
		isActive: row.is_active,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toSafeEquipment(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly equipment_name: string;
	readonly serial_number: string | null;
	readonly metadata: unknown | null;
	readonly is_active: boolean;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeControlAsset {
	return {
		id: row.id,
		organizationId: row.organization_id,
		name: row.equipment_name,
		serialNumber: row.serial_number,
		metadata: row.metadata,
		isActive: row.is_active,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

function toControlAssetResponse(row: SafeControlAsset | null) {
	if (row === null) {
		return null;
	}

	return {
		id: row.id,
		organizationId: row.organizationId,
		name: row.name,
		serialNumber: row.serialNumber,
		metadata: row.metadata,
		isActive: row.isActive,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
	};
}

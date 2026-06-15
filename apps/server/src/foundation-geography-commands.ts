import {
	type Kysely,
	type MutationWriteResult,
	type SimmerDatabase,
	sql,
	type Transaction,
} from '@simmer-mosquito/db';
import {
	createRegionCommand,
	createRegionFolderCommand,
	DomainValidationError,
	deleteRegionCommand,
	deleteRegionFolderCommand,
	type FoundationCommand,
	moveRegionToFolderCommand,
	selectOrganizationSpeciesCommand,
	unselectOrganizationSpeciesCommand,
	updateRegionDetailsCommand,
	updateRegionFolderCommand,
	updateRegionGeometryCommand,
} from '@simmer-mosquito/domain';
import type { Context, Hono, MiddlewareHandler } from 'hono';
import type { AuthContext } from './auth-context.js';
import type { AuthVariables } from './auth-middleware.js';

type FoundationDb = Kysely<SimmerDatabase>;
type FoundationTransaction = Transaction<SimmerDatabase>;
type CommandContext = Context<{ Variables: AuthVariables }>;

/**
 * Foundation geography + agency taxonomy command endpoints: region folders,
 * regions (with polygon geometry), and organization-species selection.
 * (Addresses and org lookup tables are handled in foundation-commands.ts;
 * global genera/species taxonomy is operator-owned, not part of the agency
 * command surface.)
 *
 * Region geometry is not part of the synced row, so it travels through the
 * mutation `metadata.geometry` channel; the region PATCH derives detail / folder
 * / geometry changes from the fields present.
 */
export function registerFoundationGeographyCommandRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	registerRegionFolderRoutes(app, options);
	registerRegionRoutes(app, options);
	registerOrganizationSpeciesRoutes(app, options);
}

// ===========================================================================
// Region folders
// ===========================================================================

function registerRegionFolderRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/foundation/region-folders', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			createRegionFolderCommand({
				...ctx,
				regionFolderId: readText(raw.payload.id) ?? '',
				name: readText(raw.payload.name) ?? '',
				description: readNullableText(raw.payload.description),
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runRegionFolderCommands(context, options.db, [result.command], 201);
	});

	app.patch(
		'/foundation/region-folders/:regionFolderId',
		options.authContextMiddleware,
		async (context) => {
			const raw = await readJsonObject(context.req);
			if (!raw.ok) {
				return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
			}
			const ctx = agencyCommandContext(context.get('authContext'));
			const regionFolderId = context.req.param('regionFolderId');
			const result = createCommand(() =>
				updateRegionFolderCommand({
					...ctx,
					regionFolderId,
					...('name' in raw.payload ? { name: readText(raw.payload.name) ?? '' } : {}),
					...('description' in raw.payload
						? { description: readNullableText(raw.payload.description) }
						: {}),
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runRegionFolderCommands(context, options.db, [result.command]);
		},
	);

	app.delete(
		'/foundation/region-folders/:regionFolderId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				deleteRegionFolderCommand({
					...ctx,
					regionFolderId: context.req.param('regionFolderId'),
					acknowledgedRegionDetach: true,
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runRegionFolderCommands(context, options.db, [result.command]);
		},
	);
}

async function runRegionFolderCommands(
	context: CommandContext,
	db: FoundationDb,
	commands: readonly FoundationCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeCommands(db, commands, writeRegionFolderCommand);
		if (result.row === null) {
			return context.json({ error: 'region_folder_not_found' }, 404);
		}
		return context.json({ regionFolder: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeRegionFolderCommand(
	trx: FoundationTransaction,
	command: FoundationCommand,
): Promise<SafeRegionFolder | null> {
	switch (command.type) {
		case 'foundation.createRegionFolder': {
			const row = await trx
				.insertInto('region_folders')
				.values({
					id: command.payload.regionFolderId,
					organization_id: command.payload.organizationId,
					name: command.payload.name,
					description: command.payload.description,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(regionFolderReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeRegionFolder(row);
		}
		case 'foundation.updateRegionFolder':
			return updateRow(
				trx,
				'region_folders',
				command.payload.regionFolderId,
				command.payload.organizationId,
				{
					...('name' in command.payload.changes ? { name: command.payload.changes.name } : {}),
					...('description' in command.payload.changes
						? { description: command.payload.changes.description ?? null }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				regionFolderReturnColumns,
				toSafeRegionFolder,
			);
		case 'foundation.deleteRegionFolder':
			return softDelete(
				trx,
				'region_folders',
				command.payload.regionFolderId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				regionFolderReturnColumns,
				toSafeRegionFolder,
			);
		default:
			throw new Error(`Unsupported region folder command: ${command.type}`);
	}
}

// ===========================================================================
// Regions
// ===========================================================================

function registerRegionRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/foundation/regions', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const p = raw.payload;
		const result = createCommand(() =>
			createRegionCommand({
				...ctx,
				regionId: readText(p.id) ?? '',
				regionFolderId: readNullableText(p.regionFolderId),
				name: readText(p.name) ?? '',
				description: readNullableText(p.description),
				metadata: p.metadata ?? null,
				geometry: p.geometry,
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runRegionCommands(context, options.db, [result.command], 201);
	});

	app.patch('/foundation/regions/:regionId', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const commandsResult = buildRegionUpdateCommands(
			context.get('authContext'),
			context.req.param('regionId'),
			raw.payload,
		);
		if (!commandsResult.ok) {
			return context.json(commandsResult.body, 400);
		}
		return runRegionCommands(context, options.db, commandsResult.commands);
	});

	app.delete('/foundation/regions/:regionId', options.authContextMiddleware, async (context) => {
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			deleteRegionCommand({
				...ctx,
				regionId: context.req.param('regionId'),
				acknowledgedRegionDelete: true,
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runRegionCommands(context, options.db, [result.command]);
	});
}

function buildRegionUpdateCommands(
	authContext: AuthContext,
	regionId: string,
	payload: Record<string, unknown>,
): CommandsResult {
	const ctx = agencyCommandContext(authContext);
	const commands: FoundationCommand[] = [];

	if ('name' in payload || 'description' in payload || 'metadata' in payload) {
		const result = createCommand(() =>
			updateRegionDetailsCommand({
				...ctx,
				regionId,
				...('name' in payload ? { name: readText(payload.name) ?? '' } : {}),
				...('description' in payload ? { description: readNullableText(payload.description) } : {}),
				...('metadata' in payload ? { metadata: payload.metadata ?? null } : {}),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if ('regionFolderId' in payload) {
		const result = createCommand(() =>
			moveRegionToFolderCommand({
				...ctx,
				regionId,
				regionFolderId: readNullableText(payload.regionFolderId),
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if ('geometry' in payload) {
		const result = createCommand(() =>
			updateRegionGeometryCommand({
				...ctx,
				regionId,
				geometry: payload.geometry,
				acknowledgedRegionBoundaryChange: true,
			}),
		);
		if (!result.ok) return result;
		commands.push(result.command);
	}

	if (commands.length === 0) {
		return invalidUpdate('region');
	}
	return { ok: true, commands };
}

async function runRegionCommands(
	context: CommandContext,
	db: FoundationDb,
	commands: readonly FoundationCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeCommands(db, commands, writeRegionCommand);
		if (result.row === null) {
			return context.json({ error: 'region_not_found' }, 404);
		}
		return context.json({ region: result.row, txid: result.txid }, createdStatus ?? 200);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeRegionCommand(
	trx: FoundationTransaction,
	command: FoundationCommand,
): Promise<SafeRegion | null> {
	switch (command.type) {
		case 'foundation.createRegion': {
			const row = await trx
				.insertInto('regions')
				.values({
					id: command.payload.regionId,
					organization_id: command.payload.organizationId,
					region_folder_id: command.payload.regionFolderId,
					geom: geojsonToGeom(command.payload.geometry),
					name: command.payload.name,
					description: command.payload.description,
					metadata: command.payload.metadata,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(regionReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeRegion(row);
		}
		case 'foundation.updateRegionDetails':
			return updateRegion(trx, command.payload.regionId, command.payload.organizationId, {
				...('name' in command.payload.changes ? { name: command.payload.changes.name } : {}),
				...('description' in command.payload.changes
					? { description: command.payload.changes.description ?? null }
					: {}),
				...('metadata' in command.payload.changes
					? { metadata: command.payload.changes.metadata ?? null }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'foundation.moveRegionToFolder':
			return updateRegion(trx, command.payload.regionId, command.payload.organizationId, {
				region_folder_id: command.payload.regionFolderId,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'foundation.updateRegionGeometry':
			return updateRegion(trx, command.payload.regionId, command.payload.organizationId, {
				geom: geojsonToGeom(command.payload.geometry),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'foundation.deleteRegion':
			return softDelete(
				trx,
				'regions',
				command.payload.regionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				regionReturnColumns,
				toSafeRegion,
			);
		default:
			throw new Error(`Unsupported region command: ${command.type}`);
	}
}

async function updateRegion(
	trx: FoundationTransaction,
	regionId: string,
	organizationId: string,
	set: Record<string, unknown>,
): Promise<SafeRegion | null> {
	return updateRow(
		trx,
		'regions',
		regionId,
		organizationId,
		set,
		regionReturnColumns,
		toSafeRegion,
	);
}

// ===========================================================================
// Organization species selection
// ===========================================================================

function registerOrganizationSpeciesRoutes(
	app: Hono<{ Variables: AuthVariables }>,
	options: RouteOptions,
): void {
	app.post('/foundation/organization-species', options.authContextMiddleware, async (context) => {
		const raw = await readJsonObject(context.req);
		if (!raw.ok) {
			return context.json({ error: 'invalid_payload', reason: raw.reason }, 400);
		}
		const ctx = agencyCommandContext(context.get('authContext'));
		const result = createCommand(() =>
			selectOrganizationSpeciesCommand({
				...ctx,
				organizationSpeciesId: readText(raw.payload.id) ?? '',
				speciesId: readText(raw.payload.speciesId) ?? '',
			}),
		);
		if (!result.ok) {
			return context.json(result.body, 400);
		}
		return runOrganizationSpeciesCommands(context, options.db, [result.command], 201);
	});

	app.delete(
		'/foundation/organization-species/:organizationSpeciesId',
		options.authContextMiddleware,
		async (context) => {
			const ctx = agencyCommandContext(context.get('authContext'));
			const result = createCommand(() =>
				unselectOrganizationSpeciesCommand({
					...ctx,
					organizationSpeciesId: context.req.param('organizationSpeciesId'),
				}),
			);
			if (!result.ok) {
				return context.json(result.body, 400);
			}
			return runOrganizationSpeciesCommands(context, options.db, [result.command]);
		},
	);
}

async function runOrganizationSpeciesCommands(
	context: CommandContext,
	db: FoundationDb,
	commands: readonly FoundationCommand[],
	createdStatus?: 201,
) {
	try {
		const result = await writeCommands(db, commands, writeOrganizationSpeciesCommand);
		if (result.row === null) {
			return context.json({ error: 'organization_species_not_found' }, 404);
		}
		return context.json(
			{ organizationSpecies: result.row, txid: result.txid },
			createdStatus ?? 200,
		);
	} catch (error) {
		return handleCommandError(context, error);
	}
}

async function writeOrganizationSpeciesCommand(
	trx: FoundationTransaction,
	command: FoundationCommand,
): Promise<SafeOrganizationSpecies | null> {
	switch (command.type) {
		case 'foundation.selectOrganizationSpecies': {
			const row = await trx
				.insertInto('organization_species')
				.values({
					id: command.payload.organizationSpeciesId,
					organization_id: command.payload.organizationId,
					species_id: command.payload.speciesId,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(organizationSpeciesReturnColumns)
				.executeTakeFirstOrThrow();
			return toSafeOrganizationSpecies(row);
		}
		case 'foundation.unselectOrganizationSpecies':
			return softDelete(
				trx,
				'organization_species',
				command.payload.organizationSpeciesId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				organizationSpeciesReturnColumns,
				toSafeOrganizationSpecies,
			);
		default:
			throw new Error(`Unsupported organization species command: ${command.type}`);
	}
}

// ===========================================================================
// Generic row helpers
// ===========================================================================

type WriteTable = 'region_folders' | 'regions' | 'organization_species';

async function updateRow<TRow, TSafe>(
	trx: FoundationTransaction,
	table: WriteTable,
	id: string,
	organizationId: string,
	set: Record<string, unknown>,
	columns: readonly string[],
	toSafe: (row: TRow) => TSafe,
): Promise<TSafe | null> {
	const row = await trx
		.updateTable(table)
		.set({ ...set, updated_at: sql`now()` } as never)
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(columns as never)
		.executeTakeFirst();
	return row === undefined ? null : toSafe(row as TRow);
}

async function softDelete<TRow, TSafe>(
	trx: FoundationTransaction,
	table: WriteTable,
	id: string,
	organizationId: string,
	actorProfileId: string,
	columns: readonly string[],
	toSafe: (row: TRow) => TSafe,
): Promise<TSafe | null> {
	const row = await trx
		.updateTable(table)
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: actorProfileId,
			updated_by_profile_id: actorProfileId,
			updated_at: sql`now()`,
		} as never)
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(columns as never)
		.executeTakeFirst();
	return row === undefined ? null : toSafe(row as TRow);
}

async function writeCommands<TSafe>(
	db: FoundationDb,
	commands: readonly FoundationCommand[],
	write: (trx: FoundationTransaction, command: FoundationCommand) => Promise<TSafe | null>,
): Promise<MutationWriteResult<TSafe | null>> {
	return db.transaction().execute(async (trx) => {
		let row: TSafe | null = null;
		for (const command of commands) {
			row = await write(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
}

// ===========================================================================
// Response shaping
// ===========================================================================

const regionFolderReturnColumns = [
	'id',
	'organization_id',
	'name',
	'description',
	'created_at',
	'updated_at',
] as const;

interface SafeRegionFolder {
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly description: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeRegionFolder(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly name: string;
	readonly description: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeRegionFolder {
	return {
		id: row.id,
		organizationId: row.organization_id,
		name: row.name,
		description: row.description,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const regionReturnColumns = [
	'id',
	'organization_id',
	'region_folder_id',
	'name',
	'description',
	'metadata',
	'created_at',
	'updated_at',
] as const;

interface SafeRegion {
	readonly id: string;
	readonly organizationId: string;
	readonly regionFolderId: string | null;
	readonly name: string;
	readonly description: string | null;
	readonly metadata: unknown | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeRegion(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly region_folder_id: string | null;
	readonly name: string;
	readonly description: string | null;
	readonly metadata: unknown | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeRegion {
	return {
		id: row.id,
		organizationId: row.organization_id,
		regionFolderId: row.region_folder_id,
		name: row.name,
		description: row.description,
		metadata: row.metadata,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const organizationSpeciesReturnColumns = [
	'id',
	'organization_id',
	'species_id',
	'created_at',
	'updated_at',
] as const;

interface SafeOrganizationSpecies {
	readonly id: string;
	readonly organizationId: string;
	readonly speciesId: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

function toSafeOrganizationSpecies(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly species_id: string;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeOrganizationSpecies {
	return {
		id: row.id,
		organizationId: row.organization_id,
		speciesId: row.species_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

// ===========================================================================
// Shared command + request helpers
// ===========================================================================

interface RouteOptions {
	readonly db: FoundationDb;
	readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
}

type CommandsResult =
	| { readonly ok: true; readonly commands: readonly FoundationCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody };

class CommandError extends Error {
	constructor(
		readonly status: 400 | 404,
		readonly body: { readonly error: string },
	) {
		super(body.error);
	}
}

function handleCommandError(context: CommandContext, error: unknown) {
	if (error instanceof CommandError) {
		return context.json(error.body, error.status);
	}
	throw error;
}

type InvalidCommandBody = {
	readonly error: 'invalid_command';
	readonly message: string;
	readonly issues: readonly { readonly path: string; readonly message: string }[];
};

function createCommand<TCommand extends FoundationCommand>(
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
				body: { error: 'invalid_command', message: error.message, issues: error.issues },
			};
		}
		throw error;
	}
}

function invalidUpdate(changeNoun: string): {
	readonly ok: false;
	readonly body: InvalidCommandBody;
} {
	const message = `At least one ${changeNoun} field must change.`;
	return {
		ok: false,
		body: { error: 'invalid_command', message, issues: [{ path: 'changes', message }] },
	};
}

function agencyCommandContext(authContext: AuthContext) {
	return {
		organizationId: authContext.organization.id,
		actorProfileId: authContext.profile.id,
	};
}

function geojsonToGeom(geojson: unknown) {
	const serialized = JSON.stringify(geojson);
	return sql<string>`st_force2d(st_setsrid(st_geomfromgeojson(
		case
			when (${serialized}::jsonb -> 'geometry') is not null
				then (${serialized}::jsonb -> 'geometry')::text
			else ${serialized}
		end
	), 4326))`;
}

async function readCurrentTransactionId(trx: FoundationTransaction): Promise<number> {
	const result = await sql<{
		txid: string;
	}>`select pg_current_xact_id()::xid::text as txid`.execute(trx);
	const txid = result.rows[0]?.txid;
	if (txid === undefined) {
		throw new Error('Unable to read current transaction id.');
	}
	return Number.parseInt(txid, 10);
}

type JsonResult =
	| { readonly ok: true; readonly payload: Record<string, unknown> }
	| { readonly ok: false; readonly reason: string };

async function readJsonObject(request: {
	readonly json: () => Promise<unknown>;
}): Promise<JsonResult> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return { ok: false, reason: 'Request body must be JSON.' };
	}
	if (!isRecord(raw)) {
		return { ok: false, reason: 'Request body must be an object.' };
	}
	return { ok: true, payload: raw };
}

function readText(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

function readNullableText(value: unknown): string | null {
	return readText(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

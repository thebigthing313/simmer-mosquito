import {
	type Kysely,
	type MutationWriteResult,
	RecordDeleteBlockedError,
	type SimmerDatabase,
	sql,
	type Transaction,
} from '@simmer-mosquito/db';
import { DomainValidationError, type FoundationCommand } from '@simmer-mosquito/domain';
import type { Context, MiddlewareHandler } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import { deleteBlockedBody } from '../record-deletion.js';

export type FoundationDb = Kysely<SimmerDatabase>;
export type FoundationTransaction = Transaction<SimmerDatabase>;
export type CommandContext = Context<{ Variables: AuthVariables }>;

// ===========================================================================
// Generic row helpers
// ===========================================================================

export type WriteTable = 'region_folders' | 'regions' | 'organization_species';

export async function updateRow<TRow, TSafe>(
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

export async function softDelete<TRow, TSafe>(
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

export async function writeCommands<TSafe>(
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

export const regionFolderReturnColumns = [
	'id',
	'organization_id',
	'name',
	'description',
	'created_at',
	'updated_at',
] as const;

export interface SafeRegionFolder {
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly description: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeRegionFolder(row: {
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

export const regionReturnColumns = [
	'id',
	'organization_id',
	'region_folder_id',
	'name',
	'description',
	'metadata',
	'created_at',
	'updated_at',
] as const;

export interface SafeRegion {
	readonly id: string;
	readonly organizationId: string;
	readonly regionFolderId: string | null;
	readonly name: string;
	readonly description: string | null;
	readonly metadata: unknown | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeRegion(row: {
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

export const organizationSpeciesReturnColumns = [
	'id',
	'organization_id',
	'species_id',
	'created_at',
	'updated_at',
] as const;

export interface SafeOrganizationSpecies {
	readonly id: string;
	readonly organizationId: string;
	readonly speciesId: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeOrganizationSpecies(row: {
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

export interface RouteOptions {
	readonly db: FoundationDb;
	readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
}

export type CommandsResult =
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

export function handleCommandError(context: CommandContext, error: unknown) {
	if (error instanceof CommandError) {
		return context.json(error.body, error.status);
	}
	if (error instanceof RecordDeleteBlockedError) {
		return context.json(deleteBlockedBody(error), 409);
	}
	throw error;
}

export type InvalidCommandBody = {
	readonly error: 'invalid_command';
	readonly message: string;
	readonly issues: readonly { readonly path: string; readonly message: string }[];
};

export function createCommand<TCommand extends FoundationCommand>(
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

export function invalidUpdate(changeNoun: string): {
	readonly ok: false;
	readonly body: InvalidCommandBody;
} {
	const message = `At least one ${changeNoun} field must change.`;
	return {
		ok: false,
		body: { error: 'invalid_command', message, issues: [{ path: 'changes', message }] },
	};
}

export function agencyCommandContext(authContext: AuthContext) {
	return {
		organizationId: authContext.organization.id,
		actorProfileId: authContext.profile.id,
	};
}

export function geojsonToGeom(geojson: unknown) {
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

export type JsonResult =
	| { readonly ok: true; readonly payload: Record<string, unknown> }
	| { readonly ok: false; readonly reason: string };

export async function readJsonObject(request: {
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

export function readText(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

export function readNullableText(value: unknown): string | null {
	return readText(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

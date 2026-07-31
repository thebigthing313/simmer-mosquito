import { type Kysely, type SimmerDatabase, sql, type Transaction } from '@simmer-mosquito/db';
import {
	type AdultSurveillanceCommand,
	type CollectionTiming,
	DomainValidationError,
} from '@simmer-mosquito/domain';
import type { Context } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';

export type AdultSurveillanceDb = Kysely<SimmerDatabase>;
export type AdultSurveillanceTransaction = Transaction<SimmerDatabase>;

// ---------------------------------------------------------------------------
// Geometry + location source resolution
// ---------------------------------------------------------------------------

export async function resolveLocationGeom(
	trx: AdultSurveillanceTransaction,
	organizationId: string,
	source: { readonly kind: string } & Record<string, unknown>,
): Promise<ReturnType<typeof geojsonToGeom>> {
	switch (source.kind) {
		case 'geometry':
			return geojsonToGeom(source.geometry);
		case 'address': {
			const row = await trx
				.selectFrom('addresses')
				.select(['geojson'])
				.where('id', '=', source.addressId as string)
				.where('organization_id', '=', organizationId)
				.where('deleted_at', 'is', null)
				.executeTakeFirst();
			if (row === undefined) {
				throw new CommandError(404, { error: 'address_not_found' });
			}
			return geojsonToGeom(row.geojson);
		}
		case 'trap': {
			const snapshot = await loadTrapSnapshot(trx, organizationId, source.trapId as string);
			return geojsonToGeom(snapshot.geojson);
		}
		default:
			throw new CommandError(400, { error: 'unsupported_location_source' });
	}
}

export async function loadTrapSnapshot(
	trx: AdultSurveillanceTransaction,
	organizationId: string,
	trapId: string,
): Promise<{
	readonly geojson: unknown;
	readonly collectionMethodId: string;
	readonly collectionLureId: string | null;
	readonly addressId: string | null;
}> {
	const row = await trx
		.selectFrom('traps')
		.select(['geojson', 'collection_method_id', 'collection_lure_id', 'address_id'])
		.where('id', '=', trapId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (row === undefined) {
		throw new CommandError(404, { error: 'trap_not_found' });
	}
	return {
		geojson: row.geojson,
		collectionMethodId: row.collection_method_id,
		collectionLureId: row.collection_lure_id,
		addressId: row.address_id,
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

export function localDateColumn(value: string) {
	return sql<Date>`${value}::date`;
}

// ---------------------------------------------------------------------------
// Timing helpers
// ---------------------------------------------------------------------------

export function readCollectionTiming(payload: Record<string, unknown>): CollectionTiming {
	if (payload.collectionTimingMode === 'collection_date_duration') {
		return {
			mode: 'collection_date_duration',
			collectionDate: readText(payload.collectionDate) ?? '',
			durationAmount: readNumber(payload.durationAmount) ?? Number.NaN,
			durationUnitId: readText(payload.durationUnitId) ?? '',
		};
	}
	const startedAt = readDate(payload.startedAt) ?? new Date(Number.NaN);
	const collectedAt = readDate(payload.collectedAt);
	if (collectedAt !== undefined) {
		return { mode: 'exact_timestamps', startedAt, collectedAt };
	}
	return { mode: 'exact_timestamps', startedAt };
}

export function hasTimingFields(payload: Record<string, unknown>): boolean {
	return (
		'collectionTimingMode' in payload ||
		'startedAt' in payload ||
		'collectedAt' in payload ||
		'collectionDate' in payload ||
		'durationAmount' in payload ||
		'durationUnitId' in payload
	);
}

export function isCollectedTiming(timing: CollectionTiming): boolean {
	return timing.mode === 'collection_date_duration' || 'collectedAt' in timing;
}

export function pendingStartedAt(timing: CollectionTiming): Date {
	return timing.mode === 'exact_timestamps' ? timing.startedAt : new Date(Number.NaN);
}

// ---------------------------------------------------------------------------
// Response shaping
// ---------------------------------------------------------------------------

export const trapReturnColumns = [
	'id',
	'organization_id',
	'collection_method_id',
	'address_id',
	'collection_lure_id',
	'trap_name',
	'trap_code',
	'description',
	'is_active',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

export interface SafeTrap {
	readonly id: string;
	readonly organizationId: string;
	readonly collectionMethodId: string;
	readonly addressId: string | null;
	readonly collectionLureId: string | null;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly description: string | null;
	readonly isActive: boolean;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeTrap(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly collection_method_id: string;
	readonly address_id: string | null;
	readonly collection_lure_id: string | null;
	readonly trap_name: string | null;
	readonly trap_code: string | null;
	readonly description: string | null;
	readonly is_active: boolean;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeTrap {
	return {
		id: row.id,
		organizationId: row.organization_id,
		collectionMethodId: row.collection_method_id,
		addressId: row.address_id,
		collectionLureId: row.collection_lure_id,
		trapName: row.trap_name,
		trapCode: row.trap_code,
		description: row.description,
		isActive: row.is_active,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const collectionReturnColumns = [
	'id',
	'organization_id',
	'trap_id',
	'collection_method_id',
	'collection_lure_id',
	'address_id',
	'collected_at',
	'collected_by_profile_id',
	'started_at',
	'set_by_profile_id',
	'collection_timing_mode',
	'collection_date',
	'duration_amount',
	'duration_unit_id',
	'has_problem',
	'is_zero_result',
	'has_bycatch',
	'metadata',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

export interface SafeCollection {
	readonly id: string;
	readonly organizationId: string;
	readonly trapId: string | null;
	readonly collectionMethodId: string;
	readonly collectionLureId: string | null;
	readonly addressId: string | null;
	readonly collectedAt: Date | null;
	readonly collectedByProfileId: string | null;
	readonly startedAt: Date | null;
	readonly setByProfileId: string | null;
	readonly collectionTimingMode: string;
	readonly collectionDate: Date | null;
	readonly durationAmount: number | null;
	readonly durationUnitId: string | null;
	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;
	readonly metadata: unknown | null;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeCollection(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly trap_id: string | null;
	readonly collection_method_id: string;
	readonly collection_lure_id: string | null;
	readonly address_id: string | null;
	readonly collected_at: Date | null;
	readonly collected_by_profile_id: string | null;
	readonly started_at: Date | null;
	readonly set_by_profile_id: string | null;
	readonly collection_timing_mode: string;
	readonly collection_date: Date | null;
	readonly duration_amount: number | null;
	readonly duration_unit_id: string | null;
	readonly has_problem: boolean;
	readonly is_zero_result: boolean;
	readonly has_bycatch: boolean;
	readonly metadata: unknown | null;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeCollection {
	return {
		id: row.id,
		organizationId: row.organization_id,
		trapId: row.trap_id,
		collectionMethodId: row.collection_method_id,
		collectionLureId: row.collection_lure_id,
		addressId: row.address_id,
		collectedAt: row.collected_at,
		collectedByProfileId: row.collected_by_profile_id,
		startedAt: row.started_at,
		setByProfileId: row.set_by_profile_id,
		collectionTimingMode: row.collection_timing_mode,
		collectionDate: row.collection_date,
		durationAmount: row.duration_amount,
		durationUnitId: row.duration_unit_id,
		hasProblem: row.has_problem,
		isZeroResult: row.is_zero_result,
		hasBycatch: row.has_bycatch,
		metadata: row.metadata,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const collectionSpeciesReturnColumns = [
	'id',
	'organization_id',
	'collection_id',
	'species_id',
	'count',
	'sex',
	'status',
	'identified_by_profile_id',
	'identified_date',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

export interface SafeCollectionSpecies {
	readonly id: string;
	readonly organizationId: string;
	readonly collectionId: string;
	readonly speciesId: string;
	readonly count: number;
	readonly sex: string | null;
	readonly status: string | null;
	readonly identifiedByProfileId: string | null;
	readonly identifiedDate: Date;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeCollectionSpecies(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly collection_id: string;
	readonly species_id: string;
	readonly count: number;
	readonly sex: string | null;
	readonly status: string | null;
	readonly identified_by_profile_id: string | null;
	readonly identified_date: Date;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeCollectionSpecies {
	return {
		id: row.id,
		organizationId: row.organization_id,
		collectionId: row.collection_id,
		speciesId: row.species_id,
		count: row.count,
		sex: row.sex,
		status: row.status,
		identifiedByProfileId: row.identified_by_profile_id,
		identifiedDate: row.identified_date,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

// ---------------------------------------------------------------------------
// Shared command + request helpers
// ---------------------------------------------------------------------------

export type CommandContext = Context<{ Variables: AuthVariables }>;

export type TrapUpdateColumns = {
	geom?: ReturnType<typeof geojsonToGeom>;
	collection_method_id?: string;
	address_id?: string | null;
	collection_lure_id?: string | null;
	trap_name?: string | null;
	trap_code?: string | null;
	description?: string | null;
	is_active?: boolean;
	updated_by_profile_id: string;
};

export type CollectionTimingColumns = {
	collection_timing_mode: 'exact_timestamps' | 'collection_date_duration';
	started_at: Date | null;
	collected_at: Date | null;
	collection_date: ReturnType<typeof localDateColumn> | null;
	duration_amount: number | null;
	duration_unit_id: string | null;
};

export type CollectionUpdateColumns = {
	geom?: ReturnType<typeof geojsonToGeom>;
	collection_method_id?: string;
	collection_lure_id?: string | null;
	address_id?: string | null;
	collected_at?: Date | null;
	collected_by_profile_id?: string | null;
	set_by_profile_id?: string | null;
	has_problem?: boolean;
	is_zero_result?: boolean;
	has_bycatch?: boolean;
	metadata?: unknown | null;
	updated_by_profile_id: string;
} & Partial<CollectionTimingColumns>;

export interface CollectionInsertInput {
	readonly id: string;
	readonly organizationId: string;
	readonly geom: ReturnType<typeof geojsonToGeom>;
	readonly trapId: string | null;
	readonly collectionMethodId: string;
	readonly collectionLureId: string | null;
	readonly addressId: string | null;
	readonly timing: CollectionTiming;
	readonly setByProfileId: string | null;
	readonly collectedByProfileId: string | null;
	readonly hasProblem: boolean;
	readonly metadata: unknown | null;
	readonly actorProfileId: string;
}

export class CommandError extends Error {
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
	throw error;
}

export type InvalidCommandBody = {
	readonly error: 'invalid_command';
	readonly message: string;
	readonly issues: readonly { readonly path: string; readonly message: string }[];
};

export function createCommand<TCommand extends AdultSurveillanceCommand>(
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

export async function readCurrentTransactionId(trx: AdultSurveillanceTransaction): Promise<number> {
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

export async function readOptionalJsonObject(request: {
	readonly json: () => Promise<unknown>;
}): Promise<Record<string, unknown> | undefined> {
	try {
		const raw = await request.json();
		return isRecord(raw) ? raw : undefined;
	} catch {
		return undefined;
	}
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

export function readNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readDate(value: unknown): Date | undefined {
	if (typeof value !== 'string' && !(value instanceof Date)) {
		return undefined;
	}
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? undefined : date;
}

export function readSpeciesSex(value: unknown): 'male' | 'female' | null {
	return value === 'male' || value === 'female' ? value : null;
}

export function readSpeciesStatus(
	value: unknown,
): 'damaged' | 'unfed' | 'bloodfed' | 'gravid' | null {
	return value === 'damaged' || value === 'unfed' || value === 'bloodfed' || value === 'gravid'
		? value
		: null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import {
	type CatalogReference,
	geojsonToGeom,
	localDateColumn,
	type SelectedRow,
	updateRow,
} from '@simmer-mosquito/db';
import type { CollectionTiming } from '@simmer-mosquito/domain';
import {
	agencyCommandContext,
	type CommandContext,
	CommandError,
	commandEndpoint,
	createCommand,
	type InvalidCommandBody,
	invalidUpdate,
} from '../command-endpoint.js';
import { readNumber, readText } from '../command-payload.js';
import {
	type CommandDb,
	type CommandTransaction,
	readDate,
	runCommands,
} from '../command-write.js';
import { resolveLocationGeom } from '../location-source.js';

export type AdultSurveillanceDb = CommandDb;
export type AdultSurveillanceTransaction = CommandTransaction;
export { geojsonToGeom, localDateColumn, readDate, resolveLocationGeom, runCommands, updateRow };

// ---------------------------------------------------------------------------
// Geometry + location source resolution
// ---------------------------------------------------------------------------

/**
 * A trap's geometry *and* the defaults a collection inherits from it.
 *
 * Stays here, unlike the resolver: this reads FK columns as well as geometry,
 * so it is a per-caller shape rather than the shared "what is this row's
 * geometry" question.
 */
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
	// The one place the shared `readDate`'s sentinel is load-bearing rather than
	// cosmetic: absence here decides whether the timing carries `collectedAt` at
	// all, which is what separates a pending collection from a collected one.
	const collectedAt = readDate(payload.collectedAt);
	if (collectedAt !== null) {
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

export type TrapRow = SelectedRow<'traps', typeof trapReturnColumns>;

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

export type CollectionRow = SelectedRow<'collections', typeof collectionReturnColumns>;

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

export type CollectionSpeciesRow = SelectedRow<
	'collection_species',
	typeof collectionSpeciesReturnColumns
>;

// ---------------------------------------------------------------------------
// Shared command + request helpers
// ---------------------------------------------------------------------------

export {
	agencyCommandContext,
	type CommandContext,
	commandEndpoint,
	createCommand,
	type InvalidCommandBody,
	invalidUpdate,
};

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
	collected_assignment_item_id?: string | null;
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
	/**
	 * The assignment stops this row came from, if any. Two columns rather than
	 * one because setting and collecting a trap are separate visits on separate
	 * days, so they are separate stops on separate assignments — a single link
	 * would let the collect visit erase the set visit's provenance.
	 */
	readonly setAssignmentItemId?: string | null;
	readonly collectedAssignmentItemId?: string | null;
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

/**
 * The two catalogs a Trap and a Collection both name.
 *
 * Only the keys present are gated, so renaming a trap asks nothing of the
 * catalogs and moving its method asks only about the method.
 */
export function surveillanceCatalogReferences(source: {
	readonly collectionMethodId?: string | null | undefined;
	readonly collectionLureId?: string | null | undefined;
}): CatalogReference[] {
	const references: CatalogReference[] = [];
	if ('collectionMethodId' in source) {
		references.push({
			column: 'collection_method_id',
			catalog: 'collectionMethod',
			id: source.collectionMethodId ?? null,
			label: 'collection method',
		});
	}
	if ('collectionLureId' in source) {
		references.push({
			column: 'collection_lure_id',
			catalog: 'collectionLure',
			id: source.collectionLureId ?? null,
			label: 'lure',
		});
	}
	return references;
}

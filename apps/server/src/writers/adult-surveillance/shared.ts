import {
	type CatalogReference,
	geojsonToGeom,
	localDateColumn,
	updateRow,
} from '@simmer-mosquito/db';
import {
	type AdultCollectionTimingMode,
	type CollectionTiming,
	SPECIES_SEXES,
	SPECIES_STATUSES,
	type SpeciesSex,
	type SpeciesStatus,
} from '@simmer-mosquito/domain';
import { CommandError } from '../../command-endpoint.js';
import type { CommandTransaction } from '../../command-write.js';
import { resolveLocationGeom } from '../../location-source.js';
import type { CommandRow } from '../../return-columns.js';

export type AdultSurveillanceTransaction = CommandTransaction;
export { geojsonToGeom, localDateColumn, resolveLocationGeom, updateRow };

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

export function pendingStartedAt(timing: CollectionTiming): Date {
	return timing.mode === 'exact_timestamps' ? timing.startedAt : new Date(Number.NaN);
}

// ---------------------------------------------------------------------------
// Response shaping
// ---------------------------------------------------------------------------

export type TrapRow = CommandRow<'traps'>;

export type CollectionRow = CommandRow<'collections'>;

export type CollectionSpeciesRow = CommandRow<'collection_species'>;

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
	collection_timing_mode: AdultCollectionTimingMode;
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

export function readSpeciesSex(value: unknown): SpeciesSex | null {
	return SPECIES_SEXES.includes(value as SpeciesSex) ? (value as SpeciesSex) : null;
}

export function readSpeciesStatus(value: unknown): SpeciesStatus | null {
	return SPECIES_STATUSES.includes(value as SpeciesStatus) ? (value as SpeciesStatus) : null;
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

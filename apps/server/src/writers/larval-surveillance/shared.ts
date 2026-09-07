import {
	type CatalogReference,
	geojsonToGeom,
	localDateColumn,
	updateRow,
} from '@simmer-mosquito/db';
import { LARVAL_DENSITIES, type LarvalDensity } from '@simmer-mosquito/domain';
import { CommandError } from '../../command-endpoint.js';
import type { CommandTransaction } from '../../command-write.js';
import { resolveLocationGeom } from '../../location-source.js';
import type { CommandRow } from '../../return-columns.js';

export type LarvalSurveillanceTransaction = CommandTransaction;
export { geojsonToGeom, localDateColumn, resolveLocationGeom, updateRow };

export async function loadHabitatSnapshot(
	trx: LarvalSurveillanceTransaction,
	organizationId: string,
	habitatId: string,
): Promise<{
	readonly geojson: unknown;
	readonly habitatTypeId: string | null;
	readonly addressId: string | null;
}> {
	const row = await trx
		.selectFrom('habitats')
		.select(['geojson', 'habitat_type_id', 'address_id'])
		.where('id', '=', habitatId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (row === undefined) {
		throw new CommandError(404, { error: 'habitat_not_found' });
	}
	return {
		geojson: row.geojson,
		habitatTypeId: row.habitat_type_id,
		addressId: row.address_id,
	};
}

export interface NormalizedInspectionResult {
	readonly isWet: boolean;
	readonly dipCount: number | null;
	readonly density: LarvalDensity | null;
	readonly larvaeCount: number | null;
	readonly hasFirstInstar: boolean;
	readonly hasSecondInstar: boolean;
	readonly hasThirdInstar: boolean;
	readonly hasFourthInstar: boolean;
	readonly hasPupae: boolean;
	readonly hasEggs: boolean;
}

// ---------------------------------------------------------------------------
// Request payload helpers
// ---------------------------------------------------------------------------

/**
 * A density band, or nothing.
 *
 * Exported because `table-commands/inspections.ts` reads the same five bands
 * off the `density` column, and the set is not something two readers should
 * each hold a copy of.
 */
export function readDensity(value: unknown): LarvalDensity | null {
	return LARVAL_DENSITIES.includes(value as LarvalDensity) ? (value as LarvalDensity) : null;
}

// ---------------------------------------------------------------------------
// Response shaping
// ---------------------------------------------------------------------------

export type HabitatRow = CommandRow<'habitats'>;

export type InspectionRow = CommandRow<'inspections'>;

export type SampleRow = CommandRow<'samples'>;

export type SampleSpeciesRow = CommandRow<'sample_species'>;

// ---------------------------------------------------------------------------
// Shared command + request helpers
// ---------------------------------------------------------------------------

export type HabitatUpdateColumns = {
	geom?: ReturnType<typeof geojsonToGeom>;
	address_id?: string | null;
	habitat_type_id?: string | null;
	habitat_name?: string | null;
	description?: string;
	metadata?: unknown | null;
	is_active?: boolean;
	is_inaccessible?: boolean;
	updated_by_profile_id: string;
};

export type InspectionResultColumns = {
	is_wet: boolean;
	dip_count: number | null;
	density: LarvalDensity | null;
	larvae_count: number | null;
	has_first_instar: boolean;
	has_second_instar: boolean;
	has_third_instar: boolean;
	has_fourth_instar: boolean;
	has_pupae: boolean;
	has_eggs: boolean;
};

export type InspectionUpdateColumns = {
	geom?: ReturnType<typeof geojsonToGeom>;
	habitat_type_id?: string | null;
	address_id?: string | null;
	inspected_by_profile_id?: string | null;
	inspection_date?: ReturnType<typeof localDateColumn>;
	updated_by_profile_id: string;
} & Partial<InspectionResultColumns>;

export type SampleUpdateColumns = {
	display_name?: string | null;
	is_zero_larvae?: boolean;
	has_non_mosquito?: boolean;
	unidentifiable_reason?: string | null;
	updated_by_profile_id: string;
};

/**
 * The one catalog a Habitat and an Inspection both name.
 *
 * Only a key that is present is gated, so an edit that moves the inspection
 * date asks nothing of the catalogs. Matches
 * `adult-surveillance-commands/shared.ts`, which does the same for the two a
 * Trap and a Collection name.
 */
export function habitatTypeReferences(source: {
	readonly habitatTypeId?: string | null | undefined;
}): CatalogReference[] {
	if (!('habitatTypeId' in source)) {
		return [];
	}
	return [
		{
			column: 'habitat_type_id',
			catalog: 'habitatType',
			id: source.habitatTypeId ?? null,
			label: 'habitat type',
		},
	];
}

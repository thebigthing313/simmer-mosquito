import { geojsonToGeom, localDateColumn, type SelectedRow, updateRow } from '@simmer-mosquito/db';
import {
	type LarvalDensity,
	type ResolvedLarvalInspectionEntryPolicy,
	resolveOrganizationSettings,
} from '@simmer-mosquito/domain';
import {
	agencyCommandContext,
	type CommandContext,
	CommandError,
	commandEndpoint,
	createCommand,
	type InvalidCommandBody,
	invalidUpdate,
} from '../command-endpoint.js';
import { readNullableText, readText } from '../command-payload.js';
import {
	type CommandDb,
	type CommandTransaction,
	readNumberOrNull,
	runCommands,
} from '../command-write.js';
import { resolveLocationGeom } from '../location-source.js';

export type LarvalSurveillanceDb = CommandDb;
export type LarvalSurveillanceTransaction = CommandTransaction;
export {
	agencyCommandContext,
	type CommandContext,
	commandEndpoint,
	createCommand,
	geojsonToGeom,
	type InvalidCommandBody,
	invalidUpdate,
	localDateColumn,
	resolveLocationGeom,
	runCommands,
	updateRow,
};

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
// Geometry + policy resolution
// ---------------------------------------------------------------------------

export async function loadInspectionPolicy(
	db: LarvalSurveillanceDb,
	organizationId: string,
): Promise<ResolvedLarvalInspectionEntryPolicy> {
	const organization = await db
		.selectFrom('organizations')
		.select('settings')
		.where('id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return resolveOrganizationSettings(organization?.settings).settings.larvalSurveillance
		.inspectionEntryPolicy;
}

// ---------------------------------------------------------------------------
// Request payload helpers
// ---------------------------------------------------------------------------

export function readInspectionResult(
	payload: Record<string, unknown>,
): NormalizedInspectionResult & {
	readonly inspectionDate: string;
	readonly inspectedByProfileId: string | null;
} {
	return {
		inspectionDate: readText(payload.inspectionDate) ?? '',
		inspectedByProfileId: readNullableText(payload.inspectedByProfileId),
		isWet: payload.isWet === true,
		dipCount: readNumberOrNull(payload.dipCount),
		density: readDensity(payload.density),
		larvaeCount: readNumberOrNull(payload.larvaeCount),
		hasFirstInstar: payload.hasFirstInstar === true,
		hasSecondInstar: payload.hasSecondInstar === true,
		hasThirdInstar: payload.hasThirdInstar === true,
		hasFourthInstar: payload.hasFourthInstar === true,
		hasPupae: payload.hasPupae === true,
		hasEggs: payload.hasEggs === true,
	};
}

export function hasInspectionResultFields(payload: Record<string, unknown>): boolean {
	return 'inspectionDate' in payload || 'isWet' in payload;
}

/**
 * A density band, or nothing.
 *
 * Exported because `table-commands/inspections.ts` reads the same five values
 * off a column named `density` rather than `density`'s camelCase twin, and the
 * set of bands is not something two readers should each hold a copy of.
 */
export function readDensity(value: unknown): LarvalDensity | null {
	return value === 'none' ||
		value === 'light' ||
		value === 'medium' ||
		value === 'heavy' ||
		value === 'very_heavy'
		? value
		: null;
}

// ---------------------------------------------------------------------------
// Response shaping
// ---------------------------------------------------------------------------

export const habitatReturnColumns = [
	'id',
	'organization_id',
	'address_id',
	'habitat_type_id',
	'habitat_name',
	'description',
	'is_active',
	'is_inaccessible',
	'metadata',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

export type HabitatRow = SelectedRow<'habitats', typeof habitatReturnColumns>;

export const inspectionReturnColumns = [
	'id',
	'organization_id',
	'habitat_id',
	'habitat_type_id',
	'address_id',
	'inspected_by_profile_id',
	'inspection_date',
	'is_wet',
	'dip_count',
	'density',
	'larvae_count',
	'has_first_instar',
	'has_second_instar',
	'has_third_instar',
	'has_fourth_instar',
	'has_pupae',
	'has_eggs',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

export type InspectionRow = SelectedRow<'inspections', typeof inspectionReturnColumns>;

export const sampleReturnColumns = [
	'id',
	'organization_id',
	'inspection_id',
	'display_name',
	'is_zero_larvae',
	'has_non_mosquito',
	'unidentifiable_reason',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

export type SampleRow = SelectedRow<'samples', typeof sampleReturnColumns>;

export const sampleSpeciesReturnColumns = [
	'id',
	'organization_id',
	'sample_id',
	'species_id',
	'identified_by_profile_id',
	'identified_at',
	'larvae_count',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

export type SampleSpeciesRow = SelectedRow<'sample_species', typeof sampleSpeciesReturnColumns>;

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

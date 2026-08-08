import { geojsonToGeom, localDateColumn, updateRow } from '@simmer-mosquito/db';
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

function readDensity(value: unknown): LarvalDensity | null {
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

export interface SafeHabitat {
	readonly id: string;
	readonly organizationId: string;
	readonly addressId: string | null;
	readonly habitatTypeId: string | null;
	readonly habitatName: string | null;
	readonly description: string;
	readonly isActive: boolean;
	readonly isInaccessible: boolean;
	readonly metadata: unknown | null;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeHabitat(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly address_id: string | null;
	readonly habitat_type_id: string | null;
	readonly habitat_name: string | null;
	readonly description: string;
	readonly is_active: boolean;
	readonly is_inaccessible: boolean;
	readonly metadata: unknown | null;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeHabitat {
	return {
		id: row.id,
		organizationId: row.organization_id,
		addressId: row.address_id,
		habitatTypeId: row.habitat_type_id,
		habitatName: row.habitat_name,
		description: row.description,
		isActive: row.is_active,
		isInaccessible: row.is_inaccessible,
		metadata: row.metadata,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

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

export interface SafeInspection {
	readonly id: string;
	readonly organizationId: string;
	readonly habitatId: string | null;
	readonly habitatTypeId: string | null;
	readonly addressId: string | null;
	readonly inspectedByProfileId: string | null;
	readonly inspectionDate: Date;
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
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeInspection(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly habitat_id: string | null;
	readonly habitat_type_id: string | null;
	readonly address_id: string | null;
	readonly inspected_by_profile_id: string | null;
	readonly inspection_date: Date;
	readonly is_wet: boolean;
	readonly dip_count: number | null;
	readonly density: LarvalDensity | null;
	readonly larvae_count: number | null;
	readonly has_first_instar: boolean;
	readonly has_second_instar: boolean;
	readonly has_third_instar: boolean;
	readonly has_fourth_instar: boolean;
	readonly has_pupae: boolean;
	readonly has_eggs: boolean;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeInspection {
	return {
		id: row.id,
		organizationId: row.organization_id,
		habitatId: row.habitat_id,
		habitatTypeId: row.habitat_type_id,
		addressId: row.address_id,
		inspectedByProfileId: row.inspected_by_profile_id,
		inspectionDate: row.inspection_date,
		isWet: row.is_wet,
		dipCount: row.dip_count,
		density: row.density,
		larvaeCount: row.larvae_count,
		hasFirstInstar: row.has_first_instar,
		hasSecondInstar: row.has_second_instar,
		hasThirdInstar: row.has_third_instar,
		hasFourthInstar: row.has_fourth_instar,
		hasPupae: row.has_pupae,
		hasEggs: row.has_eggs,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

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

export interface SafeSample {
	readonly id: string;
	readonly organizationId: string;
	readonly inspectionId: string;
	readonly displayName: string | null;
	readonly isZeroLarvae: boolean;
	readonly hasNonMosquito: boolean;
	readonly unidentifiableReason: string | null;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeSample(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly inspection_id: string;
	readonly display_name: string | null;
	readonly is_zero_larvae: boolean;
	readonly has_non_mosquito: boolean;
	readonly unidentifiable_reason: string | null;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeSample {
	return {
		id: row.id,
		organizationId: row.organization_id,
		inspectionId: row.inspection_id,
		displayName: row.display_name,
		isZeroLarvae: row.is_zero_larvae,
		hasNonMosquito: row.has_non_mosquito,
		unidentifiableReason: row.unidentifiable_reason,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

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

export interface SafeSampleSpecies {
	readonly id: string;
	readonly organizationId: string;
	readonly sampleId: string;
	readonly speciesId: string;
	readonly identifiedByProfileId: string | null;
	readonly identifiedAt: Date;
	readonly larvaeCount: number;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeSampleSpecies(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly sample_id: string;
	readonly species_id: string;
	readonly identified_by_profile_id: string | null;
	readonly identified_at: Date;
	readonly larvae_count: number;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeSampleSpecies {
	return {
		id: row.id,
		organizationId: row.organization_id,
		sampleId: row.sample_id,
		speciesId: row.species_id,
		identifiedByProfileId: row.identified_by_profile_id,
		identifiedAt: row.identified_at,
		larvaeCount: row.larvae_count,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

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

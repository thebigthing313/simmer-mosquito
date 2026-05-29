export type LarvalDensity = 'none' | 'light' | 'medium' | 'heavy' | 'very_heavy';

interface OwnedGeometryProjection {
	readonly lat?: number;
	readonly lng?: number;
	readonly geojson?: unknown;
	readonly geomType?: string;
}

export interface HabitatRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly lat?: number;
	readonly lng?: number;
	readonly geojson?: unknown;
	readonly geomType?: string;
	readonly addressId: string | null;
	readonly habitatTypeId: string | null;
	readonly habitatName: string | null;
	readonly description: string;
	readonly isActive: boolean;
	readonly isInaccessible: boolean;
	readonly metadata: unknown | null;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface HabitatDisplayRow extends HabitatRow, OwnedGeometryProjection {}

export interface InspectionRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly habitatId: string | null;
	readonly habitatTypeId: string | null;
	readonly addressId: string | null;
	readonly inspectedByProfileId: string | null;
	readonly inspectionDate: string;
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
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface InspectionDisplayRow extends InspectionRow, OwnedGeometryProjection {}

export interface SampleRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly inspectionId: string;
	readonly displayName: string | null;
	readonly isZeroLarvae: boolean;
	readonly hasNonMosquito: boolean;
	readonly unidentifiableReason: string | null;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface SampleSpeciesRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly sampleId: string;
	readonly speciesId: string;
	readonly identifiedByProfileId: string | null;
	readonly identifiedAt: string;
	readonly larvaeCount: number;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

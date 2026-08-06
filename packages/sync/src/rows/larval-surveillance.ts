export type LarvalDensity = 'none' | 'light' | 'medium' | 'heavy' | 'very_heavy';

// Full geometry (geojson) is not synced through Electric; it is fetched from the
// /map/* display endpoints. The synced row carries only the trigger-maintained
// centroid columns (lat, lng, geomType), which always resolve because geom is
// NOT NULL on the locatable tables.
export interface OwnedGeometryProjection {
	readonly geojson?: unknown;
}

export interface HabitatRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
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
	// Centroid columns are optional because an inspection's geometry is derived
	// server-side (snapshotted from its habitat or an ad-hoc draw) at commit, so
	// the optimistic row may not carry them yet. Synced rows always resolve them.
	readonly lat?: number;
	readonly lng?: number;
	readonly geomType?: string;
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

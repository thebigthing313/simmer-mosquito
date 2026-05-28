export type UnitType =
	| 'weight'
	| 'distance'
	| 'area'
	| 'volume'
	| 'temperature'
	| 'duration'
	| 'count'
	| 'speed';

export type UnitSystem = 'si' | 'imperial' | 'us_customary';

export interface UnitRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly code: string;
	readonly unitName: string;
	readonly abbreviation: string;
	readonly unitType: UnitType;
	readonly unitSystem: UnitSystem;
	readonly createdAt: string;
}

export interface ProfileRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly userId: string | null;
	readonly displayName: string;
	readonly email: string | null;
	readonly isActive: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export type MembershipStatus = 'active' | 'inactive' | 'invited';
export type SimmerRole = 'owner' | 'admin' | 'manager' | 'collector' | 'viewer';

export interface MembershipRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly userId: string | null;
	readonly profileId: string;
	readonly role: SimmerRole;
	readonly status: MembershipStatus;
	readonly isDefault: boolean;
	readonly invitedEmail: string | null;
	readonly workosInvitationId: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface GenusRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly abbreviation: string;
	readonly name: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface SpeciesRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly genusId: string | null;
	readonly epithet: string;
	readonly commonName: string | null;
	readonly displayName: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface OrganizationSpeciesRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly speciesId: string;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface OrganizationRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly workosOrganizationId: string | null;
	readonly name: string;
	readonly slug: string | null;
	readonly mainContactEmail: string | null;
	readonly phoneNumber: string | null;
	readonly mailingCountry: string | null;
	readonly mailingAddressLine1: string | null;
	readonly mailingAddressLine2: string | null;
	readonly mailingLocality: string | null;
	readonly mailingRegion: string | null;
	readonly mailingPostalCode: string | null;
	readonly settings: unknown | null;
	readonly updatedAt: string;
	readonly updatedByProfileId: string | null;
}

export interface AddressRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly lat?: number;
	readonly lng?: number;
	readonly geojson?: unknown;
	readonly geomType?: string;
	readonly displayName: string;
	readonly country: string;
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
	readonly geocoderResponse: unknown | null;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface OrgLookupRowBase {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly description: string | null;
	readonly isActive: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface CollectionMethodRow extends OrgLookupRowBase {
	readonly customSchema: unknown | null;
	readonly actionThreshold: number | null;
}

export interface CollectionLureRow extends OrgLookupRowBase {}

export interface HabitatTypeRow extends OrgLookupRowBase {
	readonly customSchema: unknown | null;
}

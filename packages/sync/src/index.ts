import {
	type ElectricCollectionConfig,
	electricCollectionOptions,
} from '@tanstack/electric-db-collection';

export type WebSyncMode = 'eager' | 'on-demand';

export interface SyncDescriptor<TRow extends { readonly id: string }> {
	readonly id: string;
	readonly table: string;
	readonly endpointPath: string;
	readonly syncMode: WebSyncMode;
	readonly columns: readonly (keyof TRow & string)[];
	readonly getKey: (row: TRow) => string;
}

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

interface OrgLookupRowBase {
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

export type LarvalDensity = 'none' | 'light' | 'medium' | 'heavy' | 'very_heavy';

interface OwnedGeometryProjection {
	readonly lat: number;
	readonly lng: number;
	readonly geojson: unknown;
	readonly geomType: string;
}

export interface HabitatRow {
	readonly [key: string]: unknown;
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

export interface ControlMethodRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly customSchema: unknown;
	readonly isActive: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface VehicleRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly vehicleName: string;
	readonly metadata: unknown;
	readonly isActive: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export interface EquipmentRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly equipmentName: string;
	readonly serialNumber: string | null;
	readonly metadata: unknown;
	readonly isActive: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export type InsecticideType = 'larvicide' | 'adulticide' | 'pupicide' | 'other';

export interface InsecticideRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly tradeName: string;
	readonly activeIngredient: string;
	readonly isActive: boolean;
	readonly type: InsecticideType;
	readonly registrationNumber: string;
	readonly defaultUnitId: string;
	readonly labelUrl: string | null;
	readonly msdsUrl: string | null;
	readonly shorthand: string | null;
	readonly metadata: unknown;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly deletedAt: string | null;
}

export interface InsecticideBatchRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly insecticideId: string;
	readonly batchName: string;
	readonly isActive: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly deletedAt: string | null;
}

export interface NotificationTypeRow extends OrgLookupRowBase {}

export interface TagRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly tagName: string;
	readonly description: string | null;
	readonly color: string | null;
	readonly isActive: boolean;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export type RouteType = 'habitat' | 'trap';
export type CollectionTimingMode = 'exact_timestamps' | 'collection_date_duration';
export type SpeciesSex = 'male' | 'female';
export type SpeciesStatus = 'damaged' | 'unfed' | 'bloodfed' | 'gravid';
export type ControlType = 'application' | 'source_reduction' | 'biocontrol' | 'outreach';
export type RequestIntakeType = 'online' | 'phone' | 'walk-in' | 'other';
export type NotificationChannel = 'email' | 'sms' | 'phone';
export type MissionNotificationStatus = 'pending' | 'completed' | 'failed' | 'skipped';
export type WeatherSourceType = 'organization' | 'nws';

export interface RouteRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly routeName: string;
	readonly routeType: RouteType;
	readonly createdAt: string;
	readonly updatedAt: string;
}

interface AuditedOrganizationRowBase {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly deletedAt: string | null;
	readonly deletedByProfileId: string | null;
}

export interface RegionFolderRow extends AuditedOrganizationRowBase {
	readonly name: string;
	readonly description: string | null;
}

export interface RegionRow extends AuditedOrganizationRowBase {
	readonly regionFolderId: string | null;
	readonly name: string;
	readonly description: string | null;
	readonly metadata: unknown | null;
}

export interface TrapRow extends AuditedOrganizationRowBase {
	readonly collectionMethodId: string;
	readonly addressId: string | null;
	readonly collectionLureId: string | null;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly description: string | null;
	readonly isActive: boolean;
}

export interface AdultCollectionRow extends AuditedOrganizationRowBase {
	readonly trapId: string | null;
	readonly collectionMethodId: string;
	readonly collectionLureId: string | null;
	readonly addressId: string | null;
	readonly collectedAt: string | null;
	readonly collectedByProfileId: string | null;
	readonly startedAt: string | null;
	readonly setByProfileId: string | null;
	readonly collectionTimingMode: CollectionTimingMode;
	readonly collectionDate: string | null;
	readonly durationAmount: number | null;
	readonly durationUnitId: string | null;
	readonly hasProblem: boolean;
	readonly isZeroResult: boolean;
	readonly hasBycatch: boolean;
	readonly metadata: unknown | null;
}

export interface CollectionSpeciesRow extends AuditedOrganizationRowBase {
	readonly collectionId: string;
	readonly speciesId: string;
	readonly count: number;
	readonly sex: SpeciesSex | null;
	readonly status: SpeciesStatus | null;
	readonly identifiedByProfileId: string | null;
	readonly identifiedDate: string;
}

export interface CommentRow extends AuditedOrganizationRowBase {
	readonly entityType: string;
	readonly entityId: string;
	readonly commentText: string;
	readonly commentedByProfileId: string | null;
	readonly commentedAt: string;
	readonly isPinned: boolean;
}

export interface TagItemRow extends AuditedOrganizationRowBase {
	readonly tagId: string;
	readonly entityType: string;
	readonly entityId: string;
}

export interface AdditionalPersonnelRow extends AuditedOrganizationRowBase {
	readonly personnelProfileId: string;
	readonly entityType: string;
	readonly entityId: string;
}

export interface RouteItemRow extends AuditedOrganizationRowBase {
	readonly routeId: string;
	readonly entityType: string;
	readonly entityId: string;
	readonly position: number;
	readonly directionsToNextItem: string | null;
}

export interface AssignmentRow extends AuditedOrganizationRowBase {
	readonly assignmentName: string | null;
	readonly assignedToProfileId: string | null;
	readonly assignedByProfileId: string | null;
	readonly assignmentDate: string;
	readonly dueAt: string | null;
	readonly startedAt: string | null;
	readonly completedAt: string | null;
	readonly cancelledAt: string | null;
	readonly cancellationReason: string | null;
}

export interface AssignmentItemRow extends AuditedOrganizationRowBase {
	readonly assignmentId: string;
	readonly entityType: string;
	readonly entityId: string;
	readonly position: number;
	readonly directionsToNextItem: string | null;
	readonly completedAt: string | null;
	readonly completedByProfileId: string | null;
	readonly skippedAt: string | null;
	readonly skippedByProfileId: string | null;
	readonly skipReason: string | null;
}

export interface FormulationRow extends AuditedOrganizationRowBase {
	readonly formulationName: string;
	readonly description: string | null;
	readonly isActive: boolean;
	readonly diluentRatio: number;
}

export interface FormulationInsecticideRow extends AuditedOrganizationRowBase {
	readonly formulationId: string;
	readonly insecticideId: string;
	readonly ratio: number;
}

export interface ApplicationRow extends AuditedOrganizationRowBase {
	readonly applicationMethodId: string | null;
	readonly insecticideId: string;
	readonly applicatorProfileId: string | null;
	readonly applicationDate: string;
	readonly addressId: string | null;
	readonly vehicleId: string | null;
	readonly equipmentId: string | null;
	readonly amountApplied: number;
	readonly applicationUnitId: string;
	readonly habitatId: string | null;
	readonly collectionId: string | null;
	readonly inspectionId: string | null;
	readonly requestedControlActionId: string | null;
	readonly missionItemId: string | null;
	readonly metadata: unknown | null;
}

export interface ApplicationBatchRow extends AuditedOrganizationRowBase {
	readonly applicationId: string;
	readonly insecticideBatchId: string;
}

export interface SourceReductionRow extends AuditedOrganizationRowBase {
	readonly sourceReductionMethodId: string;
	readonly technicianProfileId: string | null;
	readonly sourceReductionDate: string;
	readonly addressId: string | null;
	readonly habitatId: string | null;
	readonly sourcesEliminatedAmount: number;
	readonly sourcesEliminatedUnitId: string;
	readonly inspectionId: string | null;
	readonly requestedControlActionId: string | null;
	readonly missionItemId: string | null;
	readonly metadata: unknown | null;
}

export interface OutreachActionRow extends AuditedOrganizationRowBase {
	readonly outreachMethodId: string;
	readonly technicianProfileId: string | null;
	readonly outreachDate: string;
	readonly addressId: string | null;
	readonly inspectionId: string | null;
	readonly reach: number;
	readonly reachDescription: string | null;
	readonly requestedControlActionId: string | null;
	readonly missionItemId: string | null;
	readonly metadata: unknown | null;
}

export interface BiocontrolActionRow extends AuditedOrganizationRowBase {
	readonly biocontrolMethodId: string;
	readonly technicianProfileId: string | null;
	readonly biocontrolDate: string;
	readonly addressId: string | null;
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
	readonly amountReleased: number;
	readonly releaseUnitId: string;
	readonly requestedControlActionId: string | null;
	readonly missionItemId: string | null;
	readonly metadata: unknown | null;
}

export interface ContactRow extends AuditedOrganizationRowBase {
	readonly contactName: string | null;
	readonly preferredPhone: string | null;
	readonly alternatePhone: string | null;
	readonly email: string | null;
	readonly company: string | null;
	readonly department: string | null;
	readonly title: string | null;
	readonly wantsEmail: boolean;
	readonly wantsSms: boolean;
	readonly wantsPhone: boolean;
	readonly metadata: unknown | null;
}

export interface ServiceRequestRow extends AuditedOrganizationRowBase {
	readonly displayName: number | null;
	readonly intakeType: RequestIntakeType;
	readonly requestDate: string;
	readonly addressId: string;
	readonly contactId: string;
	readonly receivedByProfileId: string | null;
	readonly details: string;
	readonly closedAt: string | null;
	readonly closedByProfileId: string | null;
	readonly metadata: unknown | null;
}

export interface RequestedControlActionRow extends AuditedOrganizationRowBase {
	readonly controlType: ControlType;
	readonly recommendedMethodId: string | null;
	readonly summary: string | null;
	readonly habitatId: string | null;
	readonly inspectionId: string | null;
	readonly collectionId: string | null;
	readonly addressId: string | null;
	readonly requestedByProfileId: string | null;
	readonly requestedAt: string;
	readonly resolvedAt: string | null;
	readonly resolvedByProfileId: string | null;
}

export interface MissionRow extends AuditedOrganizationRowBase {
	readonly missionName: string | null;
	readonly controlType: ControlType;
	readonly plannedMethodId: string | null;
	readonly assignedToProfileId: string | null;
	readonly assignedByProfileId: string | null;
	readonly scheduledStartAt: string;
	readonly scheduledEndAt: string | null;
	readonly rainDate: string | null;
	readonly startedAt: string | null;
	readonly completedAt: string | null;
	readonly cancelledAt: string | null;
	readonly cancellationReason: string | null;
	readonly notificationTypeId: string | null;
}

export interface MissionItemRow extends AuditedOrganizationRowBase {
	readonly missionId: string;
	readonly requestedControlActionId: string | null;
	readonly addressId: string | null;
	readonly position: number;
	readonly completedAt: string | null;
	readonly completedByProfileId: string | null;
	readonly skippedAt: string | null;
	readonly skippedByProfileId: string | null;
	readonly skipReason: string | null;
}

export interface NotificationRegistrationRow extends AuditedOrganizationRowBase {
	readonly contactId: string;
	readonly addressId: string | null;
	readonly bufferDistance: number | null;
	readonly bufferUnitId: string | null;
	readonly hasBees: boolean;
	readonly isNoSpray: boolean;
	readonly isActive: boolean;
}

export interface NotificationRegistrationTypeRow extends AuditedOrganizationRowBase {
	readonly notificationRegistrationId: string;
	readonly notificationTypeId: string;
}

export interface MissionNotificationRow extends AuditedOrganizationRowBase {
	readonly missionId: string;
	readonly notificationRegistrationId: string;
	readonly contactId: string;
	readonly notificationTypeId: string;
	readonly channel: NotificationChannel;
	readonly destination: string | null;
	readonly status: MissionNotificationStatus;
	readonly statusChangedAt: string | null;
	readonly statusChangedByProfileId: string | null;
}

export interface WeatherSourceRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string | null;
	readonly sourceType: WeatherSourceType;
	readonly sourceName: string;
	readonly sourceCode: string | null;
	readonly providerSourceId: string | null;
	readonly isActive: boolean;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
	readonly deletedAt: string | null;
	readonly deletedByProfileId: string | null;
}

export interface WeatherSourceSubscriptionRow extends AuditedOrganizationRowBase {
	readonly weatherSourceId: string;
	readonly isActive: boolean;
}

export interface WeatherSummaryRow {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string | null;
	readonly weatherSourceId: string;
	readonly startDate: string;
	readonly endDate: string;
	readonly temperatureMinF: number | null;
	readonly temperatureMaxF: number | null;
	readonly precipitationInches: number | null;
	readonly relativeHumidityMin: number | null;
	readonly relativeHumidityMax: number | null;
	readonly windSpeedMinMph: number | null;
	readonly windSpeedMaxMph: number | null;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
}

export const unitsSyncDescriptor: SyncDescriptor<UnitRow> = {
	id: 'units',
	table: 'units',
	endpointPath: '/sync/shapes/units',
	syncMode: 'eager',
	columns: ['id', 'code', 'unitName', 'abbreviation', 'unitType', 'unitSystem', 'createdAt'],
	getKey: (row) => row.id,
};

export const profilesSyncDescriptor: SyncDescriptor<ProfileRow> = {
	id: 'profiles',
	table: 'profiles',
	endpointPath: '/sync/shapes/profiles',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'userId',
		'displayName',
		'email',
		'isActive',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
};

export const membershipsSyncDescriptor: SyncDescriptor<MembershipRow> = {
	id: 'memberships',
	table: 'memberships',
	endpointPath: '/sync/shapes/memberships',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'userId',
		'profileId',
		'role',
		'status',
		'isDefault',
		'invitedEmail',
		'workosInvitationId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
};

export const generaSyncDescriptor: SyncDescriptor<GenusRow> = {
	id: 'genera',
	table: 'genera',
	endpointPath: '/sync/shapes/genera',
	syncMode: 'eager',
	columns: ['id', 'abbreviation', 'name', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const speciesSyncDescriptor: SyncDescriptor<SpeciesRow> = {
	id: 'species',
	table: 'species',
	endpointPath: '/sync/shapes/species',
	syncMode: 'eager',
	columns: ['id', 'genusId', 'epithet', 'commonName', 'displayName', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const organizationSpeciesSyncDescriptor: SyncDescriptor<OrganizationSpeciesRow> = {
	id: 'organization_species',
	table: 'organization_species',
	endpointPath: '/sync/shapes/organization-species',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'speciesId', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const currentOrganizationSyncDescriptor: SyncDescriptor<OrganizationRow> = {
	id: 'current_organization',
	table: 'organizations',
	endpointPath: '/sync/shapes/organization',
	syncMode: 'eager',
	columns: [
		'id',
		'workosOrganizationId',
		'name',
		'slug',
		'mainContactEmail',
		'phoneNumber',
		'mailingCountry',
		'mailingAddressLine1',
		'mailingAddressLine2',
		'mailingLocality',
		'mailingRegion',
		'mailingPostalCode',
		'settings',
		'updatedAt',
		'updatedByProfileId',
	],
	getKey: (row) => row.id,
};

export const collectionMethodsSyncDescriptor: SyncDescriptor<CollectionMethodRow> = {
	id: 'collection_methods',
	table: 'collection_methods',
	endpointPath: '/sync/shapes/collection-methods',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'name',
		'description',
		'customSchema',
		'actionThreshold',
		'isActive',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
};

export const collectionLuresSyncDescriptor: SyncDescriptor<CollectionLureRow> = {
	id: 'collection_lures',
	table: 'collection_lures',
	endpointPath: '/sync/shapes/collection-lures',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'name', 'description', 'isActive', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const habitatTypesSyncDescriptor: SyncDescriptor<HabitatTypeRow> = {
	id: 'habitat_types',
	table: 'habitat_types',
	endpointPath: '/sync/shapes/habitat-types',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'name',
		'description',
		'customSchema',
		'isActive',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
};

export const addressesSyncDescriptor: SyncDescriptor<AddressRow> = {
	id: 'addresses',
	table: 'addresses',
	endpointPath: '/sync/shapes/addresses',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'displayName',
		'country',
		'addressLine1',
		'addressLine2',
		'locality',
		'region',
		'postalCode',
		'geocoderResponse',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
};

export const habitatsSyncDescriptor: SyncDescriptor<HabitatRow> = {
	id: 'habitats',
	table: 'habitats',
	endpointPath: '/sync/shapes/habitats',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'addressId',
		'habitatTypeId',
		'habitatName',
		'description',
		'isActive',
		'isInaccessible',
		'metadata',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
};

export const inspectionsSyncDescriptor: SyncDescriptor<InspectionRow> = {
	id: 'inspections',
	table: 'inspections',
	endpointPath: '/sync/shapes/inspections',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'habitatId',
		'habitatTypeId',
		'addressId',
		'inspectedByProfileId',
		'inspectionDate',
		'isWet',
		'dipCount',
		'density',
		'larvaeCount',
		'hasFirstInstar',
		'hasSecondInstar',
		'hasThirdInstar',
		'hasFourthInstar',
		'hasPupae',
		'hasEggs',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
};

export const samplesSyncDescriptor: SyncDescriptor<SampleRow> = {
	id: 'samples',
	table: 'samples',
	endpointPath: '/sync/shapes/samples',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'inspectionId',
		'displayName',
		'isZeroLarvae',
		'hasNonMosquito',
		'unidentifiableReason',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
};

export const sampleSpeciesSyncDescriptor: SyncDescriptor<SampleSpeciesRow> = {
	id: 'sample_species',
	table: 'sample_species',
	endpointPath: '/sync/shapes/sample-species',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'sampleId',
		'speciesId',
		'identifiedByProfileId',
		'identifiedAt',
		'larvaeCount',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
};

export const applicationMethodsSyncDescriptor: SyncDescriptor<ControlMethodRow> = {
	id: 'application_methods',
	table: 'application_methods',
	endpointPath: '/sync/shapes/application-methods',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'name', 'customSchema', 'isActive', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const sourceReductionMethodsSyncDescriptor: SyncDescriptor<ControlMethodRow> = {
	id: 'source_reduction_methods',
	table: 'source_reduction_methods',
	endpointPath: '/sync/shapes/source-reduction-methods',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'name', 'customSchema', 'isActive', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const outreachMethodsSyncDescriptor: SyncDescriptor<ControlMethodRow> = {
	id: 'outreach_methods',
	table: 'outreach_methods',
	endpointPath: '/sync/shapes/outreach-methods',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'name', 'customSchema', 'isActive', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const biocontrolMethodsSyncDescriptor: SyncDescriptor<ControlMethodRow> = {
	id: 'biocontrol_methods',
	table: 'biocontrol_methods',
	endpointPath: '/sync/shapes/biocontrol-methods',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'name', 'customSchema', 'isActive', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const vehiclesSyncDescriptor: SyncDescriptor<VehicleRow> = {
	id: 'vehicles',
	table: 'vehicles',
	endpointPath: '/sync/shapes/vehicles',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'vehicleName',
		'metadata',
		'isActive',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
};

export const equipmentSyncDescriptor: SyncDescriptor<EquipmentRow> = {
	id: 'equipment',
	table: 'equipment',
	endpointPath: '/sync/shapes/equipment',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'equipmentName',
		'serialNumber',
		'metadata',
		'isActive',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
};

export const insecticidesSyncDescriptor: SyncDescriptor<InsecticideRow> = {
	id: 'insecticides',
	table: 'insecticides',
	endpointPath: '/sync/shapes/insecticides',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'tradeName',
		'activeIngredient',
		'isActive',
		'type',
		'registrationNumber',
		'defaultUnitId',
		'labelUrl',
		'msdsUrl',
		'shorthand',
		'metadata',
		'createdAt',
		'updatedAt',
		'deletedAt',
	],
	getKey: (row) => row.id,
};

export const insecticideBatchesSyncDescriptor: SyncDescriptor<InsecticideBatchRow> = {
	id: 'insecticide_batches',
	table: 'insecticide_batches',
	endpointPath: '/sync/shapes/insecticide-batches',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'insecticideId',
		'batchName',
		'isActive',
		'createdAt',
		'updatedAt',
		'deletedAt',
	],
	getKey: (row) => row.id,
};

export const notificationTypesSyncDescriptor: SyncDescriptor<NotificationTypeRow> = {
	id: 'notification_types',
	table: 'notification_types',
	endpointPath: '/sync/shapes/notification-types',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'name', 'description', 'isActive', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const tagsSyncDescriptor: SyncDescriptor<TagRow> = {
	id: 'tags',
	table: 'tags',
	endpointPath: '/sync/shapes/tags',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'tagName',
		'description',
		'color',
		'isActive',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
};

export const routesSyncDescriptor: SyncDescriptor<RouteRow> = {
	id: 'routes',
	table: 'routes',
	endpointPath: '/sync/shapes/routes',
	syncMode: 'eager',
	columns: ['id', 'organizationId', 'routeName', 'routeType', 'createdAt', 'updatedAt'],
	getKey: (row) => row.id,
};

export const regionFoldersSyncDescriptor: SyncDescriptor<RegionFolderRow> = {
	id: 'region_folders',
	table: 'region_folders',
	endpointPath: '/sync/shapes/region-folders',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'name',
		'description',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const regionsSyncDescriptor: SyncDescriptor<RegionRow> = {
	id: 'regions',
	table: 'regions',
	endpointPath: '/sync/shapes/regions',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'regionFolderId',
		'name',
		'description',
		'metadata',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const trapsSyncDescriptor: SyncDescriptor<TrapRow> = {
	id: 'traps',
	table: 'traps',
	endpointPath: '/sync/shapes/traps',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'collectionMethodId',
		'addressId',
		'collectionLureId',
		'trapName',
		'trapCode',
		'description',
		'isActive',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const collectionsSyncDescriptor: SyncDescriptor<AdultCollectionRow> = {
	id: 'collections',
	table: 'collections',
	endpointPath: '/sync/shapes/collections',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'trapId',
		'collectionMethodId',
		'collectionLureId',
		'addressId',
		'collectedAt',
		'collectedByProfileId',
		'startedAt',
		'setByProfileId',
		'collectionTimingMode',
		'collectionDate',
		'durationAmount',
		'durationUnitId',
		'hasProblem',
		'isZeroResult',
		'hasBycatch',
		'metadata',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const collectionSpeciesSyncDescriptor: SyncDescriptor<CollectionSpeciesRow> = {
	id: 'collection_species',
	table: 'collection_species',
	endpointPath: '/sync/shapes/collection-species',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'collectionId',
		'speciesId',
		'count',
		'sex',
		'status',
		'identifiedByProfileId',
		'identifiedDate',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const commentsSyncDescriptor: SyncDescriptor<CommentRow> = {
	id: 'comments',
	table: 'comments',
	endpointPath: '/sync/shapes/comments',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'entityType',
		'entityId',
		'commentText',
		'commentedByProfileId',
		'commentedAt',
		'isPinned',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const tagItemsSyncDescriptor: SyncDescriptor<TagItemRow> = {
	id: 'tag_items',
	table: 'tag_items',
	endpointPath: '/sync/shapes/tag-items',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'tagId',
		'entityType',
		'entityId',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const additionalPersonnelSyncDescriptor: SyncDescriptor<AdditionalPersonnelRow> = {
	id: 'additional_personnel',
	table: 'additional_personnel',
	endpointPath: '/sync/shapes/additional-personnel',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'personnelProfileId',
		'entityType',
		'entityId',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const routeItemsSyncDescriptor: SyncDescriptor<RouteItemRow> = {
	id: 'route_items',
	table: 'route_items',
	endpointPath: '/sync/shapes/route-items',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'routeId',
		'entityType',
		'entityId',
		'position',
		'directionsToNextItem',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const assignmentsSyncDescriptor: SyncDescriptor<AssignmentRow> = {
	id: 'assignments',
	table: 'assignments',
	endpointPath: '/sync/shapes/assignments',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'assignmentName',
		'assignedToProfileId',
		'assignedByProfileId',
		'assignmentDate',
		'dueAt',
		'startedAt',
		'completedAt',
		'cancelledAt',
		'cancellationReason',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const assignmentItemsSyncDescriptor: SyncDescriptor<AssignmentItemRow> = {
	id: 'assignment_items',
	table: 'assignment_items',
	endpointPath: '/sync/shapes/assignment-items',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'assignmentId',
		'entityType',
		'entityId',
		'position',
		'directionsToNextItem',
		'completedAt',
		'completedByProfileId',
		'skippedAt',
		'skippedByProfileId',
		'skipReason',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const formulationsSyncDescriptor: SyncDescriptor<FormulationRow> = {
	id: 'formulations',
	table: 'formulations',
	endpointPath: '/sync/shapes/formulations',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'formulationName',
		'description',
		'isActive',
		'diluentRatio',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const formulationInsecticidesSyncDescriptor: SyncDescriptor<FormulationInsecticideRow> = {
	id: 'formulation_insecticides',
	table: 'formulation_insecticides',
	endpointPath: '/sync/shapes/formulation-insecticides',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'formulationId',
		'insecticideId',
		'ratio',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const applicationsSyncDescriptor: SyncDescriptor<ApplicationRow> = {
	id: 'applications',
	table: 'applications',
	endpointPath: '/sync/shapes/applications',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'applicationMethodId',
		'insecticideId',
		'applicatorProfileId',
		'applicationDate',
		'addressId',
		'vehicleId',
		'equipmentId',
		'amountApplied',
		'applicationUnitId',
		'habitatId',
		'collectionId',
		'inspectionId',
		'requestedControlActionId',
		'missionItemId',
		'metadata',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const applicationBatchesSyncDescriptor: SyncDescriptor<ApplicationBatchRow> = {
	id: 'application_batches',
	table: 'application_batches',
	endpointPath: '/sync/shapes/application-batches',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'applicationId',
		'insecticideBatchId',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const sourceReductionsSyncDescriptor: SyncDescriptor<SourceReductionRow> = {
	id: 'source_reductions',
	table: 'source_reductions',
	endpointPath: '/sync/shapes/source-reductions',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'sourceReductionMethodId',
		'technicianProfileId',
		'sourceReductionDate',
		'addressId',
		'habitatId',
		'sourcesEliminatedAmount',
		'sourcesEliminatedUnitId',
		'inspectionId',
		'requestedControlActionId',
		'missionItemId',
		'metadata',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const outreachActionsSyncDescriptor: SyncDescriptor<OutreachActionRow> = {
	id: 'outreach_actions',
	table: 'outreach_actions',
	endpointPath: '/sync/shapes/outreach-actions',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'outreachMethodId',
		'technicianProfileId',
		'outreachDate',
		'addressId',
		'inspectionId',
		'reach',
		'reachDescription',
		'requestedControlActionId',
		'missionItemId',
		'metadata',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const biocontrolActionsSyncDescriptor: SyncDescriptor<BiocontrolActionRow> = {
	id: 'biocontrol_actions',
	table: 'biocontrol_actions',
	endpointPath: '/sync/shapes/biocontrol-actions',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'biocontrolMethodId',
		'technicianProfileId',
		'biocontrolDate',
		'addressId',
		'habitatId',
		'inspectionId',
		'amountReleased',
		'releaseUnitId',
		'requestedControlActionId',
		'missionItemId',
		'metadata',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const contactsSyncDescriptor: SyncDescriptor<ContactRow> = {
	id: 'contacts',
	table: 'contacts',
	endpointPath: '/sync/shapes/contacts',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'contactName',
		'preferredPhone',
		'alternatePhone',
		'email',
		'company',
		'department',
		'title',
		'wantsEmail',
		'wantsSms',
		'wantsPhone',
		'metadata',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const serviceRequestsSyncDescriptor: SyncDescriptor<ServiceRequestRow> = {
	id: 'service_requests',
	table: 'service_requests',
	endpointPath: '/sync/shapes/service-requests',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'displayName',
		'intakeType',
		'requestDate',
		'addressId',
		'contactId',
		'receivedByProfileId',
		'details',
		'closedAt',
		'closedByProfileId',
		'metadata',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const requestedControlActionsSyncDescriptor: SyncDescriptor<RequestedControlActionRow> = {
	id: 'requested_control_actions',
	table: 'requested_control_actions',
	endpointPath: '/sync/shapes/requested-control-actions',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'controlType',
		'recommendedMethodId',
		'summary',
		'habitatId',
		'inspectionId',
		'collectionId',
		'addressId',
		'requestedByProfileId',
		'requestedAt',
		'resolvedAt',
		'resolvedByProfileId',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const missionsSyncDescriptor: SyncDescriptor<MissionRow> = {
	id: 'missions',
	table: 'missions',
	endpointPath: '/sync/shapes/missions',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'missionName',
		'controlType',
		'plannedMethodId',
		'assignedToProfileId',
		'assignedByProfileId',
		'scheduledStartAt',
		'scheduledEndAt',
		'rainDate',
		'startedAt',
		'completedAt',
		'cancelledAt',
		'cancellationReason',
		'notificationTypeId',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const missionItemsSyncDescriptor: SyncDescriptor<MissionItemRow> = {
	id: 'mission_items',
	table: 'mission_items',
	endpointPath: '/sync/shapes/mission-items',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'missionId',
		'requestedControlActionId',
		'addressId',
		'position',
		'completedAt',
		'completedByProfileId',
		'skippedAt',
		'skippedByProfileId',
		'skipReason',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const notificationRegistrationsSyncDescriptor: SyncDescriptor<NotificationRegistrationRow> =
	{
		id: 'notification_registrations',
		table: 'notification_registrations',
		endpointPath: '/sync/shapes/notification-registrations',
		syncMode: 'on-demand',
		columns: [
			'id',
			'organizationId',
			'contactId',
			'addressId',
			'bufferDistance',
			'bufferUnitId',
			'hasBees',
			'isNoSpray',
			'isActive',
			'createdByProfileId',
			'updatedByProfileId',
			'createdAt',
			'updatedAt',
			'deletedAt',
			'deletedByProfileId',
		],
		getKey: (row) => row.id,
	};

export const notificationRegistrationTypesSyncDescriptor: SyncDescriptor<NotificationRegistrationTypeRow> =
	{
		id: 'notification_registration_types',
		table: 'notification_registration_types',
		endpointPath: '/sync/shapes/notification-registration-types',
		syncMode: 'on-demand',
		columns: [
			'id',
			'organizationId',
			'notificationRegistrationId',
			'notificationTypeId',
			'createdByProfileId',
			'updatedByProfileId',
			'createdAt',
			'updatedAt',
			'deletedAt',
			'deletedByProfileId',
		],
		getKey: (row) => row.id,
	};

export const missionNotificationsSyncDescriptor: SyncDescriptor<MissionNotificationRow> = {
	id: 'mission_notifications',
	table: 'mission_notifications',
	endpointPath: '/sync/shapes/mission-notifications',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'missionId',
		'notificationRegistrationId',
		'contactId',
		'notificationTypeId',
		'channel',
		'destination',
		'status',
		'statusChangedAt',
		'statusChangedByProfileId',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const weatherSourcesSyncDescriptor: SyncDescriptor<WeatherSourceRow> = {
	id: 'weather_sources',
	table: 'weather_sources',
	endpointPath: '/sync/shapes/weather-sources',
	syncMode: 'eager',
	columns: [
		'id',
		'organizationId',
		'sourceType',
		'sourceName',
		'sourceCode',
		'providerSourceId',
		'isActive',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
		'deletedAt',
		'deletedByProfileId',
	],
	getKey: (row) => row.id,
};

export const weatherSourceSubscriptionsSyncDescriptor: SyncDescriptor<WeatherSourceSubscriptionRow> =
	{
		id: 'weather_source_subscriptions',
		table: 'weather_source_subscriptions',
		endpointPath: '/sync/shapes/weather-source-subscriptions',
		syncMode: 'on-demand',
		columns: [
			'id',
			'organizationId',
			'weatherSourceId',
			'isActive',
			'createdByProfileId',
			'updatedByProfileId',
			'createdAt',
			'updatedAt',
			'deletedAt',
			'deletedByProfileId',
		],
		getKey: (row) => row.id,
	};

export const weatherSummariesSyncDescriptor: SyncDescriptor<WeatherSummaryRow> = {
	id: 'weather_summaries',
	table: 'weather_summaries',
	endpointPath: '/sync/shapes/weather-summaries',
	syncMode: 'on-demand',
	columns: [
		'id',
		'organizationId',
		'weatherSourceId',
		'startDate',
		'endDate',
		'temperatureMinF',
		'temperatureMaxF',
		'precipitationInches',
		'relativeHumidityMin',
		'relativeHumidityMax',
		'windSpeedMinMph',
		'windSpeedMaxMph',
		'createdByProfileId',
		'updatedByProfileId',
		'createdAt',
		'updatedAt',
	],
	getKey: (row) => row.id,
};

export const webReadOnlyTracerDescriptors = [
	unitsSyncDescriptor,
	profilesSyncDescriptor,
	membershipsSyncDescriptor,
	generaSyncDescriptor,
	speciesSyncDescriptor,
	organizationSpeciesSyncDescriptor,
	applicationMethodsSyncDescriptor,
	sourceReductionMethodsSyncDescriptor,
	outreachMethodsSyncDescriptor,
	biocontrolMethodsSyncDescriptor,
	vehiclesSyncDescriptor,
	equipmentSyncDescriptor,
	insecticidesSyncDescriptor,
	insecticideBatchesSyncDescriptor,
	notificationTypesSyncDescriptor,
	inspectionsSyncDescriptor,
	samplesSyncDescriptor,
	sampleSpeciesSyncDescriptor,
	routesSyncDescriptor,
	regionFoldersSyncDescriptor,
	regionsSyncDescriptor,
	trapsSyncDescriptor,
	collectionsSyncDescriptor,
	collectionSpeciesSyncDescriptor,
	commentsSyncDescriptor,
	tagItemsSyncDescriptor,
	additionalPersonnelSyncDescriptor,
	routeItemsSyncDescriptor,
	assignmentsSyncDescriptor,
	assignmentItemsSyncDescriptor,
	formulationsSyncDescriptor,
	formulationInsecticidesSyncDescriptor,
	applicationsSyncDescriptor,
	applicationBatchesSyncDescriptor,
	sourceReductionsSyncDescriptor,
	outreachActionsSyncDescriptor,
	biocontrolActionsSyncDescriptor,
	contactsSyncDescriptor,
	serviceRequestsSyncDescriptor,
	requestedControlActionsSyncDescriptor,
	missionsSyncDescriptor,
	missionItemsSyncDescriptor,
	notificationRegistrationsSyncDescriptor,
	notificationRegistrationTypesSyncDescriptor,
	missionNotificationsSyncDescriptor,
	weatherSourcesSyncDescriptor,
	weatherSourceSubscriptionsSyncDescriptor,
	weatherSummariesSyncDescriptor,
] as const;

export const webCommandMutationDescriptors = [
	currentOrganizationSyncDescriptor,
	addressesSyncDescriptor,
	collectionMethodsSyncDescriptor,
	collectionLuresSyncDescriptor,
	habitatTypesSyncDescriptor,
	habitatsSyncDescriptor,
	tagsSyncDescriptor,
] as const;

export function electricShapeCollectionOptions<TRow extends { readonly id: string }>(
	input: {
		readonly descriptor: SyncDescriptor<TRow>;
		readonly url: string;
	} & Pick<ElectricCollectionConfig<TRow, never>, 'onInsert' | 'onUpdate' | 'onDelete'>,
) {
	return electricCollectionOptions<TRow>({
		id: input.descriptor.id,
		getKey: input.descriptor.getKey,
		syncMode: input.descriptor.syncMode,
		...(input.onInsert === undefined ? {} : { onInsert: input.onInsert }),
		...(input.onUpdate === undefined ? {} : { onUpdate: input.onUpdate }),
		...(input.onDelete === undefined ? {} : { onDelete: input.onDelete }),
		shapeOptions: {
			url: input.url,
			fetchClient: (request, init) =>
				fetch(request, {
					...init,
					credentials: 'include',
				}),
			params: {
				table: input.descriptor.table,
				columns: [...input.descriptor.columns],
			},
			columnMapper: snakeCamelColumnMapper,
		},
	});
}

const snakeCamelColumnMapper = {
	encode: encodeShapeColumnName,
	decode: decodeShapeColumnName,
};

export function encodeShapeColumnName(value: string): string {
	if (value === 'addressLine1') {
		return 'address_line_1';
	}
	if (value === 'addressLine2') {
		return 'address_line_2';
	}
	if (value === 'mailingAddressLine1') {
		return 'mailing_address_line_1';
	}
	if (value === 'mailingAddressLine2') {
		return 'mailing_address_line_2';
	}

	return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function decodeShapeColumnName(value: string): string {
	if (value === 'address_line_1') {
		return 'addressLine1';
	}
	if (value === 'address_line_2') {
		return 'addressLine2';
	}
	if (value === 'mailing_address_line_1') {
		return 'mailingAddressLine1';
	}
	if (value === 'mailing_address_line_2') {
		return 'mailingAddressLine2';
	}

	return value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

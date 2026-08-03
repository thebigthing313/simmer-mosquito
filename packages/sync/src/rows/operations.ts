import type { OrgLookupRowBase } from './foundation.js';

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

export interface AuditedOrganizationRowBase {
	readonly [key: string]: unknown;
	readonly id: string;
	readonly organizationId: string;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: string;
	readonly updatedAt: string;
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
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
	readonly collectionMethodId: string;
	readonly addressId: string | null;
	readonly collectionLureId: string | null;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly description: string | null;
	readonly isActive: boolean;
}

export interface AdultCollectionRow extends AuditedOrganizationRowBase {
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
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
	/** What one batch of the mix makes, in `batchUnitId`. */
	readonly batchSize: number;
	readonly batchUnitId: string;
}

export interface FormulationInsecticideRow extends AuditedOrganizationRowBase {
	readonly formulationId: string;
	readonly insecticideId: string;
	/** How much of this product one batch takes, in `unitId`. */
	readonly amount: number;
	readonly unitId: string;
}

export interface ApplicationRow extends AuditedOrganizationRowBase {
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
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
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
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
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
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
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
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
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
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

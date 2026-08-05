/**
 * Who may issue which agency command.
 *
 * The domain docs state these rules per command ("route and route item
 * management is manager-and-above", "lookup management is owner/admin only",
 * "collectors act only as themselves"), but the handlers only ever resolved
 * `AuthContext` for organization scoping. A signed-in Viewer could reorder a
 * route's stops, retire a trap, or delete a service request, and every write
 * went through.
 *
 * Every map here is a total `Record` over its command-type union on purpose: a
 * new command cannot be added without deciding who may send it, because the
 * build fails until it appears here. That is the whole reason the rules live in
 * one file per union rather than next to the handlers — a handler can forget,
 * an exhaustive `Record` cannot.
 */

import type { SimmerRole } from '@simmer-mosquito/db';
import type {
	AdultSurveillanceCommandType,
	ControlOperationsCommandType,
	FieldWorkCommandType,
	FoundationCommandType,
	LarvalSurveillanceCommandType,
	MissionDispatchCommandType,
	PublicEngagementCommandType,
} from '@simmer-mosquito/domain';
import { type ForbiddenBody, forbidden, hasAtLeastRole, type MinimumRole } from './roles.js';

/**
 * Every command type an agency membership can send.
 *
 * `weather.*` is absent because no server route answers it yet; it joins this
 * union when one does, and the build will demand a map for it.
 */
export type AgencyCommandType =
	| AdultSurveillanceCommandType
	| ControlOperationsCommandType
	| FieldWorkCommandType
	| FoundationCommandType
	| LarvalSurveillanceCommandType
	| MissionDispatchCommandType
	| PublicEngagementCommandType;

export interface CommandActor {
	readonly role: SimmerRole;
	readonly profileId: string;
}

/**
 * Where the owning record sits, for the rules a role cannot settle alone.
 *
 * The permission entry names it rather than the handler, because the handler is
 * the thing that forgets. The write loop reads this and refuses before the
 * command's own code runs, so a command mapped to an ownership rule is checked
 * whether or not anyone remembered to check it.
 */
export type OwnedRecordRef =
	| { readonly table: 'assignments'; readonly payloadKey: 'assignmentId' }
	| { readonly table: 'assignment_items'; readonly payloadKey: 'assignmentItemId' }
	| { readonly table: 'missions'; readonly payloadKey: 'missionId' }
	| { readonly table: 'mission_items'; readonly payloadKey: 'missionItemId' };

/**
 * A record a collector may correct because they performed it.
 *
 * Control operations grant collectors a correction window on their own work
 * ("collectors act only as themselves", "collectors can update their own action
 * records within 30 days of the stored action date"), which needs three things
 * from the stored row: who performed it, when the work happened, and which
 * payload key names it.
 */
export interface PerformedRecordRef {
	readonly table:
		| 'applications'
		| 'source_reductions'
		| 'outreach_actions'
		| 'biocontrol_actions'
		| 'requested_control_actions';
	readonly payloadKey: string;
	readonly performerColumn: string;
	readonly performedOnColumn: string;
	/**
	 * For a command that names a child row instead of the record itself.
	 *
	 * `removeChemicalApplicationBatch` carries only `applicationBatchId`, so the
	 * application whose performer decides the answer has to be looked up through
	 * the link row first.
	 */
	readonly through?: { readonly table: 'application_batches'; readonly parentColumn: string };
}

export type CommandPermission =
	/** A role floor and nothing else. */
	| { readonly kind: 'role'; readonly minimum: MinimumRole }
	/** Manager-and-above, or the collector the named record is assigned to. */
	| { readonly kind: 'assignedCollector'; readonly owned: OwnedRecordRef }
	/** Manager-and-above, or the author inside the correction window. */
	| { readonly kind: 'author' }
	/** Manager-and-above, or the performer inside the correction window. */
	| { readonly kind: 'performer'; readonly performed: PerformedRecordRef }
	/** No entry in the map — see `readCommandPermission`. */
	| { readonly kind: 'unmapped' };

const ADMIN: CommandPermission = { kind: 'role', minimum: 'admin' };
const MANAGER: CommandPermission = { kind: 'role', minimum: 'manager' };
const COLLECTOR: CommandPermission = { kind: 'role', minimum: 'collector' };
const AUTHOR: CommandPermission = { kind: 'author' };
const UNMAPPED: CommandPermission = { kind: 'unmapped' };

function ownAction(
	table: PerformedRecordRef['table'],
	payloadKey: string,
	performerColumn: string,
	performedOnColumn: string,
): CommandPermission {
	return {
		kind: 'performer',
		performed: { table, payloadKey, performerColumn, performedOnColumn },
	};
}

const OWN_APPLICATION = ownAction(
	'applications',
	'applicationId',
	'applicator_profile_id',
	'application_date',
);
const OWN_APPLICATION_VIA_BATCH: CommandPermission = {
	kind: 'performer',
	performed: {
		table: 'applications',
		payloadKey: 'applicationBatchId',
		performerColumn: 'applicator_profile_id',
		performedOnColumn: 'application_date',
		through: { table: 'application_batches', parentColumn: 'application_id' },
	},
};
const OWN_SOURCE_REDUCTION = ownAction(
	'source_reductions',
	'sourceReductionId',
	'technician_profile_id',
	'source_reduction_date',
);
const OWN_OUTREACH_ACTION = ownAction(
	'outreach_actions',
	'outreachActionId',
	'technician_profile_id',
	'outreach_date',
);
const OWN_BIOCONTROL_ACTION = ownAction(
	'biocontrol_actions',
	'biocontrolActionId',
	'technician_profile_id',
	'biocontrol_date',
);
const OWN_REQUESTED_ACTION = ownAction(
	'requested_control_actions',
	'requestedControlActionId',
	'requested_by_profile_id',
	'requested_at',
);

const OWN_ASSIGNMENT: CommandPermission = {
	kind: 'assignedCollector',
	owned: { table: 'assignments', payloadKey: 'assignmentId' },
};
const OWN_ASSIGNMENT_ITEM: CommandPermission = {
	kind: 'assignedCollector',
	owned: { table: 'assignment_items', payloadKey: 'assignmentItemId' },
};
const OWN_MISSION: CommandPermission = {
	kind: 'assignedCollector',
	owned: { table: 'missions', payloadKey: 'missionId' },
};
const OWN_MISSION_ITEM: CommandPermission = {
	kind: 'assignedCollector',
	owned: { table: 'mission_items', payloadKey: 'missionItemId' },
};

const FIELD_WORK_PERMISSIONS: Record<FieldWorkCommandType, CommandPermission> = {
	// Commenting is collector-and-above; editing someone else's note, or an old
	// one of your own, is supervisory. Pinning changes prominence for everyone.
	'fieldWork.addComment': COLLECTOR,
	'fieldWork.updateComment': AUTHOR,
	'fieldWork.deleteComment': AUTHOR,
	'fieldWork.pinComment': MANAGER,
	'fieldWork.unpinComment': MANAGER,

	// Tag catalog management is manager-and-above; applying a tag is field entry.
	'fieldWork.createTag': MANAGER,
	'fieldWork.updateTag': MANAGER,
	'fieldWork.activateTag': MANAGER,
	'fieldWork.deactivateTag': MANAGER,
	'fieldWork.deleteTag': MANAGER,
	'fieldWork.assignTag': COLLECTOR,
	'fieldWork.unassignTag': COLLECTOR,

	'fieldWork.addAdditionalPersonnel': COLLECTOR,
	'fieldWork.removeAdditionalPersonnel': COLLECTOR,

	// Shared route catalog editing is supervisory operational planning.
	'fieldWork.createRoute': MANAGER,
	'fieldWork.updateRouteDetails': MANAGER,
	'fieldWork.deleteRoute': MANAGER,
	'fieldWork.addRouteItem': MANAGER,
	'fieldWork.updateRouteItem': MANAGER,
	'fieldWork.removeRouteItem': MANAGER,
	'fieldWork.moveRouteItems': MANAGER,

	// Assignment planning is manager-and-above, with one collector exception:
	// pulling today's route onto yourself.
	'fieldWork.createAssignment': MANAGER,
	'fieldWork.createAssignmentFromRoute': MANAGER,
	'fieldWork.selfAssignRoute': COLLECTOR,
	'fieldWork.updateAssignmentDetails': MANAGER,
	'fieldWork.addAssignmentItem': MANAGER,
	'fieldWork.updateAssignmentItem': MANAGER,
	'fieldWork.removeAssignmentItem': MANAGER,
	'fieldWork.moveAssignmentItems': MANAGER,
	'fieldWork.deleteAssignment': MANAGER,
	'fieldWork.cancelAssignment': MANAGER,
	'fieldWork.reopenAssignment': MANAGER,

	// Executing the work: the assigned collector, or any manager correcting it.
	'fieldWork.startAssignment': OWN_ASSIGNMENT,
	'fieldWork.completeAssignment': OWN_ASSIGNMENT,
	'fieldWork.completeAssignmentItem': OWN_ASSIGNMENT_ITEM,
	'fieldWork.reopenAssignmentItem': OWN_ASSIGNMENT_ITEM,
	'fieldWork.skipAssignmentItem': OWN_ASSIGNMENT_ITEM,
	'fieldWork.unskipAssignmentItem': OWN_ASSIGNMENT_ITEM,
};

const MISSION_DISPATCH_PERMISSIONS: Record<MissionDispatchCommandType, CommandPermission> = {
	// Collectors cannot create missions, edit any part of them, or end them.
	'missionDispatch.createMission': MANAGER,
	'missionDispatch.updateMissionDetails': MANAGER,
	'missionDispatch.updateMissionSchedule': MANAGER,
	'missionDispatch.updateMissionPlan': MANAGER,
	'missionDispatch.assignMission': MANAGER,
	'missionDispatch.updateMissionNotificationType': MANAGER,
	'missionDispatch.cancelMission': MANAGER,
	'missionDispatch.reopenMission': MANAGER,
	'missionDispatch.deleteMission': MANAGER,
	'missionDispatch.addMissionItem': MANAGER,
	'missionDispatch.addMissionItemFromRequestedControlAction': MANAGER,
	'missionDispatch.updateMissionItemLocationAndLink': MANAGER,
	'missionDispatch.removeMissionItem': MANAGER,
	'missionDispatch.moveMissionItems': MANAGER,

	// Assigned collectors execute their own mission and record the work. The four
	// `record*` commands have no handler yet; when one lands it inherits this
	// check from the map rather than having to remember it.
	'missionDispatch.startMission': OWN_MISSION,
	'missionDispatch.completeMission': OWN_MISSION,
	'missionDispatch.completeMissionItem': OWN_MISSION_ITEM,
	'missionDispatch.reopenMissionItem': OWN_MISSION_ITEM,
	'missionDispatch.skipMissionItem': OWN_MISSION_ITEM,
	'missionDispatch.unskipMissionItem': OWN_MISSION_ITEM,
	'missionDispatch.recordChemicalApplicationForMissionItem': OWN_MISSION_ITEM,
	'missionDispatch.recordSourceReductionForMissionItem': OWN_MISSION_ITEM,
	'missionDispatch.recordOutreachActionForMissionItem': OWN_MISSION_ITEM,
	'missionDispatch.recordBiocontrolActionForMissionItem': OWN_MISSION_ITEM,
};

/**
 * `docs/foundation-domain.md`.
 *
 * Addresses are the one foundation table a collector touches: "createAddress is
 * collector-and-above so mobile collectors can create ad hoc address book
 * entries while entering field records. Update, delete, and merge are
 * manager-and-above." Everything else here configures the agency — regions and
 * folders are manager-and-above, lookups and species curation are owner/admin.
 *
 * The taxonomy commands are operator-side: `apps/admin` owns the global genus
 * and species catalog and writes it through `admin-foundations.ts`, which never
 * reads this map. They are mapped to `admin` rather than left unmapped so that
 * an agency route added later inherits a floor instead of a hole.
 */
const FOUNDATION_PERMISSIONS: Record<FoundationCommandType, CommandPermission> = {
	'foundation.createAddress': COLLECTOR,
	'foundation.updateAddressDetails': MANAGER,
	'foundation.updateAddressLocation': MANAGER,
	'foundation.deleteAddress': MANAGER,
	'foundation.mergeAddresses': MANAGER,

	'foundation.createRegionFolder': MANAGER,
	'foundation.updateRegionFolder': MANAGER,
	'foundation.deleteRegionFolder': MANAGER,
	'foundation.createRegion': MANAGER,
	'foundation.updateRegionDetails': MANAGER,
	'foundation.moveRegionToFolder': MANAGER,
	'foundation.updateRegionGeometry': MANAGER,
	'foundation.deleteRegion': MANAGER,

	'foundation.createGenus': ADMIN,
	'foundation.updateGenus': ADMIN,
	'foundation.deleteGenus': ADMIN,
	'foundation.createSpecies': ADMIN,
	'foundation.updateSpecies': ADMIN,
	'foundation.deleteSpecies': ADMIN,

	'foundation.selectOrganizationSpecies': ADMIN,
	'foundation.unselectOrganizationSpecies': ADMIN,

	'foundation.createCollectionMethod': ADMIN,
	'foundation.updateCollectionMethod': ADMIN,
	'foundation.deactivateCollectionMethod': ADMIN,
	'foundation.reactivateCollectionMethod': ADMIN,
	'foundation.deleteCollectionMethod': ADMIN,
	'foundation.createCollectionLure': ADMIN,
	'foundation.updateCollectionLure': ADMIN,
	'foundation.deactivateCollectionLure': ADMIN,
	'foundation.reactivateCollectionLure': ADMIN,
	'foundation.deleteCollectionLure': ADMIN,
	'foundation.createHabitatType': ADMIN,
	'foundation.updateHabitatType': ADMIN,
	'foundation.deactivateHabitatType': ADMIN,
	'foundation.reactivateHabitatType': ADMIN,
	'foundation.deleteHabitatType': ADMIN,
};

/**
 * `docs/larval-surveillance-domain.md`.
 *
 * "Habitat catalog commands are mostly manager-and-above workflows" — the
 * `mostly` is the named exception below it: "Collectors may update low-risk
 * habitat details and accessibility". `createHabitatFromInspection` is in that
 * exception in spirit but not in the doc's list, and it is how a collector
 * turns a source they just found into a habitat, so refusing it would strand
 * the ad-hoc inspection flow. It is collector-and-above here and the doc now
 * says so; plain `createHabitat` stays supervisory.
 *
 * Inspections, samples, and sample species counts are the field work itself and
 * are collector-and-above throughout, deletes included — the doc lists the
 * deletes inside the same collector groups.
 */
const LARVAL_SURVEILLANCE_PERMISSIONS: Record<LarvalSurveillanceCommandType, CommandPermission> = {
	'larvalSurveillance.createHabitat': MANAGER,
	'larvalSurveillance.createHabitatFromInspection': COLLECTOR,
	'larvalSurveillance.updateHabitatDetails': COLLECTOR,
	'larvalSurveillance.markHabitatInaccessible': COLLECTOR,
	'larvalSurveillance.clearHabitatInaccessible': COLLECTOR,
	'larvalSurveillance.updateHabitatLocation': MANAGER,
	'larvalSurveillance.updateHabitatConfiguration': MANAGER,
	'larvalSurveillance.retireHabitat': MANAGER,
	'larvalSurveillance.reactivateHabitat': MANAGER,
	'larvalSurveillance.deleteHabitat': MANAGER,
	'larvalSurveillance.mergeHabitats': MANAGER,

	'larvalSurveillance.recordHabitatInspection': COLLECTOR,
	'larvalSurveillance.recordAdHocInspection': COLLECTOR,
	'larvalSurveillance.updateInspectionFieldDetails': COLLECTOR,
	'larvalSurveillance.updateAdHocInspectionLocation': COLLECTOR,
	'larvalSurveillance.deleteInspection': COLLECTOR,

	'larvalSurveillance.addInspectionSample': COLLECTOR,
	'larvalSurveillance.addUnlabeledInspectionSample': COLLECTOR,
	'larvalSurveillance.updateInspectionSample': COLLECTOR,
	'larvalSurveillance.deleteInspectionSample': COLLECTOR,
	'larvalSurveillance.markSampleZeroLarvae': COLLECTOR,
	'larvalSurveillance.clearSampleZeroLarvae': COLLECTOR,
	'larvalSurveillance.setSampleNonMosquitoPresence': COLLECTOR,
	'larvalSurveillance.setSampleUnidentifiableReason': COLLECTOR,

	'larvalSurveillance.addSampleSpeciesCount': COLLECTOR,
	'larvalSurveillance.updateSampleSpeciesCount': COLLECTOR,
	'larvalSurveillance.deleteSampleSpeciesCount': COLLECTOR,
};

/**
 * `docs/adult-surveillance-domain.md`.
 *
 * "Trap catalog commands are manager-and-above workflows", "Collection workflow
 * commands are collector-and-above workflows", "Analysis workflow commands are
 * collector-and-above workflows". The doc lists each command under its heading,
 * so this map is a transcription rather than a judgement.
 */
const ADULT_SURVEILLANCE_PERMISSIONS: Record<AdultSurveillanceCommandType, CommandPermission> = {
	'adultSurveillance.createTrap': MANAGER,
	'adultSurveillance.updateTrapDetails': MANAGER,
	'adultSurveillance.updateTrapConfiguration': MANAGER,
	'adultSurveillance.retireTrap': MANAGER,
	'adultSurveillance.reactivateTrap': MANAGER,
	'adultSurveillance.deleteTrap': MANAGER,

	'adultSurveillance.setTrapCollection': COLLECTOR,
	'adultSurveillance.setAdHocCollection': COLLECTOR,
	'adultSurveillance.recordCollectedTrapCollection': COLLECTOR,
	'adultSurveillance.recordCollectedAdHocCollection': COLLECTOR,
	'adultSurveillance.collectCollection': COLLECTOR,
	'adultSurveillance.cancelPendingCollection': COLLECTOR,
	'adultSurveillance.updateCollectionFieldDetails': COLLECTOR,
	'adultSurveillance.updateAdHocCollectionConfiguration': COLLECTOR,
	'adultSurveillance.deleteCollection': COLLECTOR,

	'adultSurveillance.addCollectionSpeciesCount': COLLECTOR,
	'adultSurveillance.updateCollectionSpeciesCount': COLLECTOR,
	'adultSurveillance.deleteCollectionSpeciesCount': COLLECTOR,
	'adultSurveillance.markCollectionZeroResult': COLLECTOR,
	'adultSurveillance.clearCollectionZeroResult': COLLECTOR,
	'adultSurveillance.setCollectionBycatch': COLLECTOR,
};

/**
 * `docs/control-operations-domain.md`.
 *
 * The catalog half is a transcription of "Catalog permissions": methods,
 * insecticides, and formulations are owner/admin; vehicles, equipment, and
 * insecticide batches are manager-and-above.
 *
 * The recording half is the only place in SIMMER where a collector's reach
 * depends on a record they performed rather than one assigned to them —
 * "collectors act only as themselves", "collectors can update their own action
 * records within 30 days of the stored action date". Those commands carry a
 * `performer` rule the write transaction settles.
 *
 * The four `delete*` action commands are **stricter here than the doc**. The
 * doc grants a collector their own recent record "only when no support rows or
 * batch links exist" and escalates to manager once a requested control action
 * is linked; those extra preconditions are not implemented, and the safe
 * direction to be wrong in is the restrictive one. See the follow-up issue
 * named in `docs/control-operations-domain.md`.
 */
const CONTROL_OPERATIONS_PERMISSIONS: Record<ControlOperationsCommandType, CommandPermission> = {
	'controlOperations.createApplicationMethod': ADMIN,
	'controlOperations.updateApplicationMethod': MANAGER,
	'controlOperations.deactivateApplicationMethod': ADMIN,
	'controlOperations.reactivateApplicationMethod': ADMIN,
	'controlOperations.deleteApplicationMethod': ADMIN,
	'controlOperations.createSourceReductionMethod': ADMIN,
	'controlOperations.updateSourceReductionMethod': MANAGER,
	'controlOperations.deactivateSourceReductionMethod': ADMIN,
	'controlOperations.reactivateSourceReductionMethod': ADMIN,
	'controlOperations.deleteSourceReductionMethod': ADMIN,
	'controlOperations.createOutreachMethod': ADMIN,
	'controlOperations.updateOutreachMethod': MANAGER,
	'controlOperations.deactivateOutreachMethod': ADMIN,
	'controlOperations.reactivateOutreachMethod': ADMIN,
	'controlOperations.deleteOutreachMethod': ADMIN,
	'controlOperations.createBiocontrolMethod': ADMIN,
	'controlOperations.updateBiocontrolMethod': MANAGER,
	'controlOperations.deactivateBiocontrolMethod': ADMIN,
	'controlOperations.reactivateBiocontrolMethod': ADMIN,
	'controlOperations.deleteBiocontrolMethod': ADMIN,

	'controlOperations.createVehicle': MANAGER,
	'controlOperations.updateVehicle': MANAGER,
	'controlOperations.deactivateVehicle': MANAGER,
	'controlOperations.reactivateVehicle': MANAGER,
	'controlOperations.deleteVehicle': MANAGER,
	'controlOperations.createEquipment': MANAGER,
	'controlOperations.updateEquipment': MANAGER,
	'controlOperations.deactivateEquipment': MANAGER,
	'controlOperations.reactivateEquipment': MANAGER,
	'controlOperations.deleteEquipment': MANAGER,

	'controlOperations.createInsecticide': ADMIN,
	'controlOperations.updateInsecticide': ADMIN,
	'controlOperations.deactivateInsecticide': ADMIN,
	'controlOperations.reactivateInsecticide': ADMIN,
	'controlOperations.deleteInsecticide': ADMIN,

	'controlOperations.createInsecticideBatch': MANAGER,
	'controlOperations.updateInsecticideBatch': MANAGER,
	'controlOperations.deactivateInsecticideBatch': MANAGER,
	'controlOperations.reactivateInsecticideBatch': MANAGER,
	'controlOperations.deleteInsecticideBatch': MANAGER,

	'controlOperations.createFormulation': ADMIN,
	'controlOperations.updateFormulationDetails': ADMIN,
	'controlOperations.activateFormulation': ADMIN,
	'controlOperations.deactivateFormulation': ADMIN,
	'controlOperations.deleteFormulation': ADMIN,
	'controlOperations.addFormulationInsecticide': ADMIN,
	'controlOperations.updateFormulationInsecticide': ADMIN,
	'controlOperations.removeFormulationInsecticide': ADMIN,

	'controlOperations.recordChemicalApplication': COLLECTOR,
	'controlOperations.updateChemicalApplicationFieldDetails': OWN_APPLICATION,
	'controlOperations.updateChemicalApplicationLocationAndContext': OWN_APPLICATION,
	'controlOperations.deleteChemicalApplication': MANAGER,
	'controlOperations.addChemicalApplicationBatch': OWN_APPLICATION,
	'controlOperations.removeChemicalApplicationBatch': OWN_APPLICATION_VIA_BATCH,

	'controlOperations.recordSourceReduction': COLLECTOR,
	'controlOperations.updateSourceReductionFieldDetails': OWN_SOURCE_REDUCTION,
	'controlOperations.updateSourceReductionLocationAndContext': OWN_SOURCE_REDUCTION,
	'controlOperations.deleteSourceReduction': MANAGER,

	'controlOperations.recordOutreachAction': COLLECTOR,
	'controlOperations.updateOutreachActionFieldDetails': OWN_OUTREACH_ACTION,
	'controlOperations.updateOutreachActionLocationAndContext': OWN_OUTREACH_ACTION,
	'controlOperations.deleteOutreachAction': MANAGER,

	'controlOperations.recordBiocontrolAction': COLLECTOR,
	'controlOperations.updateBiocontrolActionFieldDetails': OWN_BIOCONTROL_ACTION,
	'controlOperations.updateBiocontrolActionLocationAndContext': OWN_BIOCONTROL_ACTION,
	'controlOperations.deleteBiocontrolAction': MANAGER,

	'controlOperations.requestControlAction': COLLECTOR,
	'controlOperations.updateRequestedControlActionDetails': OWN_REQUESTED_ACTION,
	'controlOperations.updateRequestedControlActionLocationAndContext': OWN_REQUESTED_ACTION,
	'controlOperations.resolveRequestedControlAction': MANAGER,
	'controlOperations.reopenRequestedControlAction': MANAGER,
	'controlOperations.deleteRequestedControlAction': MANAGER,
};

/**
 * `docs/public-engagement-domain.md`.
 *
 * The clearest of the five, because the doc states it as a role list rather
 * than per command: owner/admin/manager manage contacts, service requests,
 * notification registrations, and mission notifications; owner/admin manage the
 * notification type catalog; "collector: no public engagement management
 * commands"; viewer read-only. Collectors reach this domain only through the
 * shared field-work comment and tag commands, which are mapped elsewhere.
 */
const PUBLIC_ENGAGEMENT_PERMISSIONS: Record<PublicEngagementCommandType, CommandPermission> = {
	'publicEngagement.createContact': MANAGER,
	'publicEngagement.updateContactDetails': MANAGER,
	'publicEngagement.updateContactCommunication': MANAGER,
	'publicEngagement.mergeContacts': MANAGER,
	'publicEngagement.deleteContact': MANAGER,

	'publicEngagement.createServiceRequest': MANAGER,
	'publicEngagement.updateServiceRequestDetails': MANAGER,
	'publicEngagement.updateServiceRequestContact': MANAGER,
	'publicEngagement.updateServiceRequestLocation': MANAGER,
	'publicEngagement.closeServiceRequest': MANAGER,
	'publicEngagement.reopenServiceRequest': MANAGER,
	'publicEngagement.deleteServiceRequest': MANAGER,

	'publicEngagement.createNotificationType': ADMIN,
	'publicEngagement.updateNotificationType': ADMIN,
	'publicEngagement.deactivateNotificationType': ADMIN,
	'publicEngagement.reactivateNotificationType': ADMIN,
	'publicEngagement.deleteNotificationType': ADMIN,

	'publicEngagement.createNotificationRegistration': MANAGER,
	'publicEngagement.updateNotificationRegistrationContact': MANAGER,
	'publicEngagement.updateNotificationRegistrationLocation': MANAGER,
	'publicEngagement.updateNotificationRegistrationBuffer': MANAGER,
	'publicEngagement.updateNotificationRegistrationFlags': MANAGER,
	'publicEngagement.deactivateNotificationRegistration': MANAGER,
	'publicEngagement.reactivateNotificationRegistration': MANAGER,
	'publicEngagement.deleteNotificationRegistration': MANAGER,
	'publicEngagement.subscribeNotificationRegistrationType': MANAGER,
	'publicEngagement.unsubscribeNotificationRegistrationType': MANAGER,

	'publicEngagement.generateMissionNotifications': MANAGER,
	'publicEngagement.completeMissionNotification': MANAGER,
	'publicEngagement.failMissionNotification': MANAGER,
	'publicEngagement.skipMissionNotification': MANAGER,
	'publicEngagement.reopenMissionNotification': MANAGER,
};

/**
 * Every per-domain map, merged.
 *
 * The merge is what routes a lookup; the per-domain annotations above are what
 * make each half exhaustive. Both matter: without the annotations a missing
 * command would widen this object's inferred type instead of failing the build.
 */
const COMMAND_PERMISSIONS: Record<AgencyCommandType, CommandPermission> = {
	...FIELD_WORK_PERMISSIONS,
	...MISSION_DISPATCH_PERMISSIONS,
	...FOUNDATION_PERMISSIONS,
	...LARVAL_SURVEILLANCE_PERMISSIONS,
	...ADULT_SURVEILLANCE_PERMISSIONS,
	...CONTROL_OPERATIONS_PERMISSIONS,
	...PUBLIC_ENGAGEMENT_PERMISSIONS,
};

export function readCommandPermission(type: AgencyCommandType): CommandPermission {
	// The map is total over the union, so this is unreachable through the type
	// system. It stays as the runtime half of the same promise: an unmapped
	// command is a programming error, and the safe reading of "nobody decided who
	// may send this" is that nobody may.
	return COMMAND_PERMISSIONS[type] ?? UNMAPPED;
}

export type CommandDecision = 'allow' | 'deny' | 'ownership';

/**
 * What a role alone can settle.
 *
 * `ownership` means the role is high enough only if the record belongs to the
 * actor — assignment/mission assignee, or comment author — which takes a row
 * the write transaction has to read.
 */
export function decideCommand(role: SimmerRole, permission: CommandPermission): CommandDecision {
	switch (permission.kind) {
		case 'unmapped':
			return 'deny';
		// A plain floor is settled by the ladder alone, at whichever of the three
		// heights the command names. This arm has to come before the
		// manager-and-above shortcut below: an owner/admin catalog command is one a
		// manager must not pass.
		case 'role':
			return hasAtLeastRole(role, permission.minimum) ? 'allow' : 'deny';
		case 'assignedCollector':
		case 'author':
		case 'performer':
			// Every ownership rule reads "manager-and-above, or the collector this
			// row belongs to", so supervisory roles are done here and only a
			// collector is left with something for the transaction to settle.
			if (hasAtLeastRole(role, 'manager')) {
				return 'allow';
			}
			return hasAtLeastRole(role, 'collector') ? 'ownership' : 'deny';
	}
}

/**
 * The role half of the check, run before anything is written.
 *
 * Returns the 403 body to send, or null when the batch is either allowed
 * outright or left for the write transaction's ownership check.
 */
export function authorizeCommands(
	role: SimmerRole,
	commands: readonly { readonly type: AgencyCommandType }[],
): ForbiddenBody | null {
	for (const command of commands) {
		if (decideCommand(role, readCommandPermission(command.type)) === 'deny') {
			return forbidden(deniedReason(role, command.type));
		}
	}
	return null;
}

function deniedReason(role: SimmerRole, type: AgencyCommandType): string {
	return role === 'viewer' ? 'Viewers have read-only access.' : `Your role cannot perform ${type}.`;
}

/**
 * The route-boundary check, for any agency command endpoint.
 *
 * Lives here rather than in a per-domain `shared.ts` so that the modules which
 * never had a check — every one outside field work — reach for the same
 * function the gated ones already use, instead of each growing its own copy to
 * drift from.
 */
export function denyUnauthorizedAgencyCommands(
	context: {
		readonly get: (key: 'authContext') => { readonly role: SimmerRole };
		readonly json: (body: ForbiddenBody, status: 403) => Response;
	},
	commands: readonly { readonly type: AgencyCommandType }[],
): Response | null {
	const denial = authorizeCommands(context.get('authContext').role, commands);
	return denial === null ? null : context.json(denial, 403);
}

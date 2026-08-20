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
	OrganizationSettingsCommandType,
	PublicEngagementCommandType,
	WeatherCommandType,
} from '@simmer-mosquito/domain';
import { type ForbiddenBody, forbidden, hasAtLeastRole, type MinimumRole } from './roles.js';

/** Every command type an agency membership can send. */
export type AgencyCommandType =
	| AdultSurveillanceCommandType
	| ControlOperationsCommandType
	| FieldWorkCommandType
	| FoundationCommandType
	| LarvalSurveillanceCommandType
	| MissionDispatchCommandType
	| OrganizationSettingsCommandType
	| PublicEngagementCommandType
	| WeatherCommandType;

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

/**
 * The associated-record rules that turn a collector's own recent record into a
 * manager's job.
 *
 * `docs/control-operations-domain.md` grants a collector their own action record
 * for 30 days "when no supervisory/associated-record rules require manager
 * escalation", and then names what escalates. Those are conditions on the stored
 * row and its dependants, so they are declared here beside the ownership rule
 * and settled in the same write transaction.
 *
 * Deliberately not about the `acknowledged*` flags. Those are the manager's
 * confirmation that a delete will take support rows with it; a collector cannot
 * acknowledge their way past these at all, so the two are separate mechanisms
 * that happen to name the same rows.
 */
export type DeletionEscalation =
	| {
			readonly kind: 'actionRecord';
			/** The `entity_type` the polymorphic support tables store this row under. */
			readonly entityType:
				| 'application'
				| 'source_reduction'
				| 'outreach_action'
				| 'biocontrol_action';
			/** Applications alone also carry batch links. */
			readonly hasBatchLinks: boolean;
	  }
	/** A request escalates once anything references it, or once it is resolved. */
	| { readonly kind: 'requestedAction' };

export type CommandPermission =
	/** A role floor and nothing else. */
	| { readonly kind: 'role'; readonly minimum: MinimumRole }
	/**
	 * SIMMER itself, and no agency role however high.
	 *
	 * The role ladder cannot express this. Operators hold an ordinary agency
	 * membership so that their work is attributable (ADR 0011), and they join as
	 * `admin` — so `admin` is exactly the floor that does *not* separate an
	 * operator from the agency administrator sitting next to them.
	 *
	 * It exists for the global catalogs: `genera` and `species` have no
	 * `organization_id`, and every agency reads them. While the only way to write
	 * one was `/admin/*` behind the operator middleware, the distinction lived in
	 * the routing. Now that a table's commands are reachable through the shared
	 * `/commands/{table}` surface, the distinction has to live where every other
	 * authorization decision does, which is here.
	 */
	| { readonly kind: 'operator' }
	/** Manager-and-above, or the collector the named record is assigned to. */
	| { readonly kind: 'assignedCollector'; readonly owned: OwnedRecordRef }
	/** Manager-and-above, or the author inside the correction window. */
	| { readonly kind: 'author' }
	/** Manager-and-above, or the performer inside the correction window. */
	| {
			readonly kind: 'performer';
			readonly performed: PerformedRecordRef;
			/**
			 * Present on the `delete*` commands only. Correcting a record's fields is
			 * the performer's for 30 days unconditionally; removing it is theirs only
			 * while nothing else depends on it.
			 */
			readonly escalation?: DeletionEscalation;
	  }
	/** No entry in the map — see `readCommandPermission`. */
	| { readonly kind: 'unmapped' };

const ADMIN: CommandPermission = { kind: 'role', minimum: 'admin' };
const OPERATOR: CommandPermission = { kind: 'operator' };
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

/** The `delete*` twin of an `ownAction` rule, carrying what escalates it. */
function ownActionDeletion(
	base: CommandPermission,
	escalation: DeletionEscalation,
): CommandPermission {
	if (base.kind !== 'performer') {
		throw new Error('ownActionDeletion expects a performer rule.');
	}
	return { kind: 'performer', performed: base.performed, escalation };
}

const DELETE_OWN_APPLICATION = ownActionDeletion(OWN_APPLICATION, {
	kind: 'actionRecord',
	entityType: 'application',
	hasBatchLinks: true,
});
const DELETE_OWN_SOURCE_REDUCTION = ownActionDeletion(OWN_SOURCE_REDUCTION, {
	kind: 'actionRecord',
	entityType: 'source_reduction',
	hasBatchLinks: false,
});
const DELETE_OWN_OUTREACH_ACTION = ownActionDeletion(OWN_OUTREACH_ACTION, {
	kind: 'actionRecord',
	entityType: 'outreach_action',
	hasBatchLinks: false,
});
const DELETE_OWN_BIOCONTROL_ACTION = ownActionDeletion(OWN_BIOCONTROL_ACTION, {
	kind: 'actionRecord',
	entityType: 'biocontrol_action',
	hasBatchLinks: false,
});
const DELETE_OWN_REQUESTED_ACTION = ownActionDeletion(OWN_REQUESTED_ACTION, {
	kind: 'requestedAction',
});

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

	// Recording the work a stop was created for. Same floor as completing the
	// stop by hand, because that is what these do — the record is the reason.
	'fieldWork.recordHabitatInspectionForAssignmentItem': OWN_ASSIGNMENT_ITEM,
	'fieldWork.setTrapCollectionForAssignmentItem': OWN_ASSIGNMENT_ITEM,
	'fieldWork.collectTrapCollectionForAssignmentItem': OWN_ASSIGNMENT_ITEM,
	'fieldWork.recordCollectedTrapCollectionForAssignmentItem': OWN_ASSIGNMENT_ITEM,
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
 * The taxonomy commands are operator-side: `genera` and `species` have no
 * `organization_id` and every agency reads them, so writing one is SIMMER's
 * job. They used to be mapped to `admin` — a placeholder, chosen so that "an
 * agency route added later inherits a floor instead of a hole", while the real
 * check lived in `/admin/*`'s operator middleware.
 *
 * That later route is `/commands/{table}`, and `admin` turned out to be the
 * wrong floor for it: operators join an agency as `admin` themselves, so it
 * separates nobody. They are `OPERATOR` now, which is a rule the map can state
 * and every surface reads the same way.
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

	'foundation.createGenus': OPERATOR,
	'foundation.updateGenus': OPERATOR,
	'foundation.deleteGenus': OPERATOR,
	'foundation.createSpecies': OPERATOR,
	'foundation.updateSpecies': OPERATOR,
	'foundation.deleteSpecies': OPERATOR,
	'foundation.createUnit': OPERATOR,
	'foundation.updateUnit': OPERATOR,
	'foundation.deleteUnit': OPERATOR,

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
 * The five `delete*` action commands carry a `performer` rule too, plus the
 * `DeletionEscalation` the doc attaches to it: a collector's own recent record
 * is theirs to remove only while nothing depends on it. Correcting a record is
 * unconditional for the same 30 days — an `update*` cannot orphan anything,
 * whereas a delete takes the comments, assisting people, and batch links with
 * it, and a linked requested control action is somebody else's record of what
 * was asked for.
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
	'controlOperations.deleteChemicalApplication': DELETE_OWN_APPLICATION,
	'controlOperations.addChemicalApplicationBatch': OWN_APPLICATION,
	'controlOperations.removeChemicalApplicationBatch': OWN_APPLICATION_VIA_BATCH,

	'controlOperations.recordSourceReduction': COLLECTOR,
	'controlOperations.updateSourceReductionFieldDetails': OWN_SOURCE_REDUCTION,
	'controlOperations.updateSourceReductionLocationAndContext': OWN_SOURCE_REDUCTION,
	'controlOperations.deleteSourceReduction': DELETE_OWN_SOURCE_REDUCTION,

	'controlOperations.recordOutreachAction': COLLECTOR,
	'controlOperations.updateOutreachActionFieldDetails': OWN_OUTREACH_ACTION,
	'controlOperations.updateOutreachActionLocationAndContext': OWN_OUTREACH_ACTION,
	'controlOperations.deleteOutreachAction': DELETE_OWN_OUTREACH_ACTION,

	'controlOperations.recordBiocontrolAction': COLLECTOR,
	'controlOperations.updateBiocontrolActionFieldDetails': OWN_BIOCONTROL_ACTION,
	'controlOperations.updateBiocontrolActionLocationAndContext': OWN_BIOCONTROL_ACTION,
	'controlOperations.deleteBiocontrolAction': DELETE_OWN_BIOCONTROL_ACTION,

	'controlOperations.requestControlAction': COLLECTOR,
	'controlOperations.updateRequestedControlActionDetails': OWN_REQUESTED_ACTION,
	'controlOperations.updateRequestedControlActionLocationAndContext': OWN_REQUESTED_ACTION,
	'controlOperations.resolveRequestedControlAction': MANAGER,
	'controlOperations.reopenRequestedControlAction': MANAGER,
	'controlOperations.deleteRequestedControlAction': DELETE_OWN_REQUESTED_ACTION,
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
 * `docs/organization-settings-domain.md`: "Only organization owners and admins
 * can manage settings." One floor across all seven, so the interesting part is
 * not the value but that the map now holds it.
 *
 * These joined late (#130). They had been checked by a hand-written predicate
 * in `organization-settings-commands.ts` instead — which is what being outside
 * an exhaustive map produces, every time, and #121 found the same drift in all
 * three modules that sat outside it.
 *
 * The route reads its floor from here *before* it reads the body, so an
 * unauthorized caller still learns nothing about the payload's shape. That
 * ordering is why {@link readCommandPermission} takes a type rather than a
 * built command: a floor never needed the payload, only the name of the thing
 * being asked for.
 */
const ORGANIZATION_SETTINGS_PERMISSIONS: Record<
	OrganizationSettingsCommandType,
	CommandPermission
> = {
	'organizationSettings.updateTimezone': ADMIN,
	'organizationSettings.updateUnitDefaults': ADMIN,
	'organizationSettings.updateAdultCollectionTimingMode': ADMIN,
	'organizationSettings.updateLarvalInspectionEntryPolicy': ADMIN,
	'organizationSettings.updateInsecticideBatchTracking': ADMIN,
	'organizationSettings.updateServiceRequestContext': ADMIN,
	'organizationSettings.updateSpeciesKeyBindings': ADMIN,
};

/**
 * `docs/weather-domain.md`: "owner/admin/manager: full station, summary, and
 * import management", "collector/viewer: read-only". One floor across all ten.
 *
 * Weather is the last domain to arrive here, and it arrives whole. The union
 * these ten belong to was left out of `AgencyCommandType` while nothing wrote
 * one, so adding the first writer demanded a floor for every one of them in the
 * same change, which is the exhaustive `Record` doing its job rather than an
 * obstacle to work around.
 *
 * Manager rather than admin because a station and its summaries are operational
 * records, not agency configuration: the same floor the trap catalog and the
 * route catalog sit at. The domain doc says so directly, and adds that a SIMMER
 * operator gets here through an agency membership like anyone else, so no arm of
 * this map is `operator`.
 */
const WEATHER_PERMISSIONS: Record<WeatherCommandType, CommandPermission> = {
	'weather.createWeatherStation': MANAGER,
	'weather.updateWeatherStationDetails': MANAGER,
	'weather.updateWeatherStationLocation': MANAGER,
	'weather.deactivateWeatherStation': MANAGER,
	'weather.reactivateWeatherStation': MANAGER,
	'weather.deleteWeatherStation': MANAGER,

	'weather.createWeatherSummary': MANAGER,
	'weather.updateWeatherSummary': MANAGER,
	'weather.deleteWeatherSummary': MANAGER,
	'weather.commitWeatherSummaryImport': MANAGER,
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
	...ORGANIZATION_SETTINGS_PERMISSIONS,
	...PUBLIC_ENGAGEMENT_PERMISSIONS,
	...WEATHER_PERMISSIONS,
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
 * Who is asking, as far as a floor is concerned.
 *
 * Two facts rather than one, because `admin` is a height on the agency ladder
 * and "is SIMMER" is not on that ladder at all — see the `operator` arm of
 * {@link CommandPermission}.
 */
export interface CommandScope {
	readonly role: SimmerRole;
	readonly isOperator: boolean;
}

/**
 * What the actor's standing alone can settle.
 *
 * `ownership` means the role is high enough only if the record belongs to the
 * actor — assignment/mission assignee, or comment author — which takes a row
 * the write transaction has to read.
 */
export function decideCommand(scope: CommandScope, permission: CommandPermission): CommandDecision {
	const role = scope.role;
	switch (permission.kind) {
		case 'unmapped':
			return 'deny';
		// No agency role passes this, and no agency role is required to: an
		// operator's own membership role is beside the point.
		case 'operator':
			return scope.isOperator ? 'allow' : 'deny';
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
	scope: CommandScope,
	commands: readonly { readonly type: AgencyCommandType }[],
): ForbiddenBody | null {
	for (const command of commands) {
		const permission = readCommandPermission(command.type);
		if (decideCommand(scope, permission) === 'deny') {
			return forbidden(deniedReason(scope, permission, command.type));
		}
	}
	return null;
}

function deniedReason(
	scope: CommandScope,
	permission: CommandPermission,
	type: AgencyCommandType,
): string {
	// Naming the role would be actively misleading here: an agency owner is
	// refused `createSpecies` however high they are, and telling them their role
	// is too low invites them to go looking for a higher one.
	if (permission.kind === 'operator') {
		return `${type} is a SIMMER operator command.`;
	}
	return scope.role === 'viewer'
		? 'Viewers have read-only access.'
		: `Your role cannot perform ${type}.`;
}

/** Everything a floor needs, read off the session. */
function scopeOf(authContext: { readonly role: SimmerRole; readonly isOperator?: boolean }) {
	return { role: authContext.role, isOperator: authContext.isOperator === true };
}

/**
 * The route-boundary check, for any agency command endpoint.
 *
 * Lives here rather than in a per-domain `shared.ts` so that the modules which
 * never had a check — every one outside field work — reach for the same
 * function the gated ones already use, instead of each growing its own copy to
 * drift from.
 */
/**
 * The same check, for a route that knows its command type before it has a
 * command.
 *
 * A floor is settled by the actor's role and the command's name, so a route
 * whose type is fixed can refuse before reading the body — which is what the
 * settings routes want, so that an unauthorized caller cannot learn the shape
 * of a valid payload by watching 400s. `denyUnauthorizedAgencyCommands` above
 * cannot do that, because it takes commands that have already been built.
 *
 * Refuses only an outright `deny`. An `ownership` rule needs a stored row and
 * so belongs in the write transaction, not at the door.
 */
export function denyUnauthorizedCommandType(
	context: {
		readonly get: (key: 'authContext') => {
			readonly role: SimmerRole;
			readonly isOperator?: boolean;
		};
		readonly json: (body: ForbiddenBody, status: 403) => Response;
	},
	type: AgencyCommandType,
): Response | null {
	const scope = scopeOf(context.get('authContext'));
	const permission = readCommandPermission(type);
	if (decideCommand(scope, permission) !== 'deny') {
		return null;
	}

	return context.json(forbidden(deniedReason(scope, permission, type)), 403);
}

export function denyUnauthorizedAgencyCommands(
	context: {
		readonly get: (key: 'authContext') => {
			readonly role: SimmerRole;
			readonly isOperator?: boolean;
		};
		readonly json: (body: ForbiddenBody, status: 403) => Response;
	},
	commands: readonly { readonly type: AgencyCommandType }[],
): Response | null {
	const denial = authorizeCommands(scopeOf(context.get('authContext')), commands);
	return denial === null ? null : context.json(denial, 403);
}

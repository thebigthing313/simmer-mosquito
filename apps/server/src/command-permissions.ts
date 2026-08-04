/**
 * Who may issue which field-work and mission-dispatch command.
 *
 * The domain docs state these rules per command ("route and route item
 * management is manager-and-above", "assigned collectors may complete, reopen,
 * skip, and unskip items only on assignments assigned to their profile"), but
 * the handlers only ever resolved `AuthContext` for organization scoping. A
 * signed-in Viewer could reorder a route's stops and the write went through.
 *
 * Both maps are total `Record`s over their command-type union on purpose: a new
 * command cannot be added without deciding who may send it, because the build
 * fails until it appears here.
 */

import type { SimmerRole } from '@simmer-mosquito/db';
import type { FieldWorkCommandType, MissionDispatchCommandType } from '@simmer-mosquito/domain';
import { type ForbiddenBody, forbidden, hasAtLeastRole, type MinimumRole } from './roles.js';

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

export type CommandPermission =
	/** A role floor and nothing else. */
	| { readonly kind: 'role'; readonly minimum: MinimumRole }
	/** Manager-and-above, or the collector the named record is assigned to. */
	| { readonly kind: 'assignedCollector'; readonly owned: OwnedRecordRef }
	/** Manager-and-above, or the author inside the correction window. */
	| { readonly kind: 'author' }
	/** No entry in the map — see `readCommandPermission`. */
	| { readonly kind: 'unmapped' };

const MANAGER: CommandPermission = { kind: 'role', minimum: 'manager' };
const COLLECTOR: CommandPermission = { kind: 'role', minimum: 'collector' };
const AUTHOR: CommandPermission = { kind: 'author' };
const UNMAPPED: CommandPermission = { kind: 'unmapped' };

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

export function readCommandPermission(
	type: FieldWorkCommandType | MissionDispatchCommandType,
): CommandPermission {
	const permission = Object.hasOwn(FIELD_WORK_PERMISSIONS, type)
		? FIELD_WORK_PERMISSIONS[type as FieldWorkCommandType]
		: MISSION_DISPATCH_PERMISSIONS[type as MissionDispatchCommandType];
	// Both maps are total over their union, so this is unreachable through the
	// type system. It stays as the runtime half of the same promise: an unmapped
	// command is a programming error, and the safe reading of "nobody decided who
	// may send this" is that nobody may.
	return permission ?? UNMAPPED;
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
	if (permission.kind === 'unmapped') {
		return 'deny';
	}
	if (hasAtLeastRole(role, 'manager')) {
		return 'allow';
	}
	if (!hasAtLeastRole(role, 'collector')) {
		return 'deny';
	}
	switch (permission.kind) {
		case 'role':
			return permission.minimum === 'collector' ? 'allow' : 'deny';
		case 'assignedCollector':
		case 'author':
			return 'ownership';
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
	commands: readonly { readonly type: FieldWorkCommandType | MissionDispatchCommandType }[],
): ForbiddenBody | null {
	for (const command of commands) {
		if (decideCommand(role, readCommandPermission(command.type)) === 'deny') {
			return forbidden(deniedReason(role, command.type));
		}
	}
	return null;
}

function deniedReason(
	role: SimmerRole,
	type: FieldWorkCommandType | MissionDispatchCommandType,
): string {
	return role === 'viewer' ? 'Viewers have read-only access.' : `Your role cannot perform ${type}.`;
}

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

export type CommandPermission =
	/** A role floor and nothing else. */
	| { readonly kind: 'role'; readonly minimum: MinimumRole }
	/** Manager-and-above, or the collector the parent record is assigned to. */
	| { readonly kind: 'assignedCollector' }
	/** Manager-and-above, or the author inside the correction window. */
	| { readonly kind: 'author' };

const MANAGER: CommandPermission = { kind: 'role', minimum: 'manager' };
const COLLECTOR: CommandPermission = { kind: 'role', minimum: 'collector' };
const ASSIGNED: CommandPermission = { kind: 'assignedCollector' };
const AUTHOR: CommandPermission = { kind: 'author' };

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
	'fieldWork.startAssignment': ASSIGNED,
	'fieldWork.completeAssignment': ASSIGNED,
	'fieldWork.completeAssignmentItem': ASSIGNED,
	'fieldWork.reopenAssignmentItem': ASSIGNED,
	'fieldWork.skipAssignmentItem': ASSIGNED,
	'fieldWork.unskipAssignmentItem': ASSIGNED,
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

	// Assigned collectors execute their own mission and record the work.
	'missionDispatch.startMission': ASSIGNED,
	'missionDispatch.completeMission': ASSIGNED,
	'missionDispatch.completeMissionItem': ASSIGNED,
	'missionDispatch.reopenMissionItem': ASSIGNED,
	'missionDispatch.skipMissionItem': ASSIGNED,
	'missionDispatch.unskipMissionItem': ASSIGNED,
	'missionDispatch.recordChemicalApplicationForMissionItem': ASSIGNED,
	'missionDispatch.recordSourceReductionForMissionItem': ASSIGNED,
	'missionDispatch.recordOutreachActionForMissionItem': ASSIGNED,
	'missionDispatch.recordBiocontrolActionForMissionItem': ASSIGNED,
};

export function readCommandPermission(
	type: FieldWorkCommandType | MissionDispatchCommandType,
): CommandPermission {
	const permission =
		type in FIELD_WORK_PERMISSIONS
			? FIELD_WORK_PERMISSIONS[type as FieldWorkCommandType]
			: MISSION_DISPATCH_PERMISSIONS[type as MissionDispatchCommandType];
	// An unmapped command type is a programming error, not a caller error;
	// refusing it is the safe reading either way.
	return permission ?? MANAGER;
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

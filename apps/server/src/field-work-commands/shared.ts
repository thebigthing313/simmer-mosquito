import { localDateColumn, softDelete, sql, updateRow } from '@simmer-mosquito/db';
import type {
	AssignmentItemPlacement,
	FieldWorkCommand,
	RouteItemPlacement,
} from '@simmer-mosquito/domain';
import type { MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import {
	agencyCommandContext,
	type CommandContext,
	commandEndpoint,
	createCommand,
	handleCommandError,
	invalidUpdate,
	type CommandsResult as SharedCommandsResult,
} from '../command-endpoint.js';
import { isRecord, readText } from '../command-payload.js';
import { authorizeCommands } from '../command-permissions.js';
import {
	type CommandDb,
	type CommandTransaction,
	commandActor,
	nowLocalDate,
	readDate,
	readStringArray,
	writeCommands,
} from '../command-write.js';

export type FieldWorkDb = CommandDb;
export type FieldWorkTransaction = CommandTransaction;
export {
	agencyCommandContext,
	type CommandContext,
	commandActor,
	commandEndpoint,
	createCommand,
	handleCommandError,
	invalidUpdate,
	localDateColumn,
	nowLocalDate,
	readDate,
	readStringArray,
	softDelete,
	updateRow,
	writeCommands,
};

// ===========================================================================
// Ordering helpers
// ===========================================================================

export type OrderedItemTable = 'route_items' | 'assignment_items';

export async function reindexItems(
	trx: FieldWorkTransaction,
	table: OrderedItemTable,
	parentColumn: 'route_id' | 'assignment_id',
	parentId: string,
	organizationId: string,
	actorProfileId: string,
	reorder: (orderedIds: readonly string[]) => readonly string[],
): Promise<void> {
	const rows = await trx
		.selectFrom(table)
		.select('id')
		.where(parentColumn, '=', parentId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.orderBy('position', 'asc')
		.orderBy('created_at', 'asc')
		.execute();
	const ordered = reorder(rows.map((row) => row.id));
	for (let index = 0; index < ordered.length; index += 1) {
		await trx
			.updateTable(table)
			.set({ position: index, updated_by_profile_id: actorProfileId, updated_at: sql`now()` })
			.where('id', '=', ordered[index] as string)
			.where('organization_id', '=', organizationId)
			.execute();
	}
}

export function applyPlacement(
	orderedIds: readonly string[],
	movingIds: readonly string[],
	kind: 'start' | 'end' | 'before' | 'after',
	refId: string | null,
): readonly string[] {
	const moving = movingIds.filter((id) => orderedIds.includes(id));
	const remaining = orderedIds.filter((id) => !moving.includes(id));
	if (kind === 'start') {
		return [...moving, ...remaining];
	}
	if (kind === 'before' || kind === 'after') {
		const refIndex = refId === null ? -1 : remaining.indexOf(refId);
		if (refIndex !== -1) {
			const insertAt = kind === 'before' ? refIndex : refIndex + 1;
			return [...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)];
		}
	}
	return [...remaining, ...moving];
}

export function routePlacementRef(placement: RouteItemPlacement): string | null {
	return placement.kind === 'before' || placement.kind === 'after' ? placement.routeItemId : null;
}

export function assignmentPlacementRef(placement: AssignmentItemPlacement): string | null {
	return placement.kind === 'before' || placement.kind === 'after'
		? placement.assignmentItemId
		: null;
}

// ===========================================================================
// Lifecycle transition derivation (from changed timestamp fields)
// ===========================================================================

export type AssignmentLifecycle = 'start' | 'complete' | 'cancel' | 'reopen' | null;

export function readLifecycleTransition(payload: Record<string, unknown>): AssignmentLifecycle {
	if ('completedAt' in payload && payload.completedAt !== null) {
		return 'complete';
	}
	if ('cancelledAt' in payload && payload.cancelledAt !== null) {
		return 'cancel';
	}
	if ('startedAt' in payload && payload.startedAt !== null) {
		return 'start';
	}
	if (
		('completedAt' in payload && payload.completedAt === null) ||
		('cancelledAt' in payload && payload.cancelledAt === null) ||
		('startedAt' in payload && payload.startedAt === null)
	) {
		return 'reopen';
	}
	return null;
}

export type ItemLifecycle = 'complete' | 'skip' | 'reopen' | 'unskip' | null;

export function readItemLifecycleTransition(payload: Record<string, unknown>): ItemLifecycle {
	if ('skippedAt' in payload && payload.skippedAt !== null) {
		return 'skip';
	}
	if ('completedAt' in payload && payload.completedAt !== null) {
		return 'complete';
	}
	if ('skippedAt' in payload && payload.skippedAt === null) {
		return 'unskip';
	}
	if ('completedAt' in payload && payload.completedAt === null) {
		return 'reopen';
	}
	return null;
}

// ===========================================================================
// Response shaping
// ===========================================================================

export const commentReturnColumns = [
	'id',
	'organization_id',
	'entity_type',
	'entity_id',
	'comment_text',
	'commented_by_profile_id',
	'commented_at',
	'is_pinned',
	'created_at',
	'updated_at',
] as const;

export interface SafeComment {
	readonly id: string;
	readonly organizationId: string;
	readonly entityType: string;
	readonly entityId: string;
	readonly commentText: string;
	readonly isPinned: boolean;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeComment(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly entity_type: string;
	readonly entity_id: string;
	readonly comment_text: string;
	readonly is_pinned: boolean;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeComment {
	return {
		id: row.id,
		organizationId: row.organization_id,
		entityType: row.entity_type,
		entityId: row.entity_id,
		commentText: row.comment_text,
		isPinned: row.is_pinned,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const tagItemReturnColumns = [
	'id',
	'organization_id',
	'tag_id',
	'entity_type',
	'entity_id',
	'created_at',
	'updated_at',
] as const;

export interface SafeTagItem {
	readonly id: string;
	readonly organizationId: string;
	readonly tagId: string;
	readonly entityType: string;
	readonly entityId: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeTagItem(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly tag_id: string;
	readonly entity_type: string;
	readonly entity_id: string;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeTagItem {
	return {
		id: row.id,
		organizationId: row.organization_id,
		tagId: row.tag_id,
		entityType: row.entity_type,
		entityId: row.entity_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const additionalPersonnelReturnColumns = [
	'id',
	'organization_id',
	'personnel_profile_id',
	'entity_type',
	'entity_id',
	'created_at',
	'updated_at',
] as const;

export interface SafeAdditionalPersonnel {
	readonly id: string;
	readonly organizationId: string;
	readonly personnelProfileId: string;
	readonly entityType: string;
	readonly entityId: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeAdditionalPersonnel(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly personnel_profile_id: string;
	readonly entity_type: string;
	readonly entity_id: string;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeAdditionalPersonnel {
	return {
		id: row.id,
		organizationId: row.organization_id,
		personnelProfileId: row.personnel_profile_id,
		entityType: row.entity_type,
		entityId: row.entity_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const routeReturnColumns = [
	'id',
	'organization_id',
	'route_name',
	'route_type',
	'created_at',
	'updated_at',
] as const;

export interface SafeRoute {
	readonly id: string;
	readonly organizationId: string;
	readonly routeName: string;
	readonly routeType: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeRoute(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly route_name: string;
	readonly route_type: string;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeRoute {
	return {
		id: row.id,
		organizationId: row.organization_id,
		routeName: row.route_name,
		routeType: row.route_type,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const routeItemReturnColumns = [
	'id',
	'organization_id',
	'route_id',
	'entity_type',
	'entity_id',
	'position',
	'directions_to_next_item',
	'created_at',
	'updated_at',
] as const;

export interface SafeRouteItem {
	readonly id: string;
	readonly organizationId: string;
	readonly routeId: string;
	readonly entityType: string;
	readonly entityId: string;
	readonly position: number;
	readonly directionsToNextItem: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeRouteItem(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly route_id: string;
	readonly entity_type: string;
	readonly entity_id: string;
	readonly position: number;
	readonly directions_to_next_item: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeRouteItem {
	return {
		id: row.id,
		organizationId: row.organization_id,
		routeId: row.route_id,
		entityType: row.entity_type,
		entityId: row.entity_id,
		position: row.position,
		directionsToNextItem: row.directions_to_next_item,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const assignmentReturnColumns = [
	'id',
	'organization_id',
	'assignment_name',
	'assigned_to_profile_id',
	'assignment_date',
	'started_at',
	'completed_at',
	'cancelled_at',
	'created_at',
	'updated_at',
] as const;

export interface SafeAssignment {
	readonly id: string;
	readonly organizationId: string;
	readonly assignmentName: string | null;
	readonly assignedToProfileId: string | null;
	readonly startedAt: Date | null;
	readonly completedAt: Date | null;
	readonly cancelledAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeAssignment(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly assignment_name: string | null;
	readonly assigned_to_profile_id: string | null;
	readonly started_at: Date | null;
	readonly completed_at: Date | null;
	readonly cancelled_at: Date | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeAssignment {
	return {
		id: row.id,
		organizationId: row.organization_id,
		assignmentName: row.assignment_name,
		assignedToProfileId: row.assigned_to_profile_id,
		startedAt: row.started_at,
		completedAt: row.completed_at,
		cancelledAt: row.cancelled_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

export const assignmentItemReturnColumns = [
	'id',
	'organization_id',
	'assignment_id',
	'entity_type',
	'entity_id',
	'position',
	'directions_to_next_item',
	'completed_at',
	'skipped_at',
	'skip_reason',
	'created_at',
	'updated_at',
] as const;

export interface SafeAssignmentItem {
	readonly id: string;
	readonly organizationId: string;
	readonly assignmentId: string;
	readonly entityType: string;
	readonly entityId: string;
	readonly position: number;
	readonly completedAt: Date | null;
	readonly skippedAt: Date | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

export function toSafeAssignmentItem(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly assignment_id: string;
	readonly entity_type: string;
	readonly entity_id: string;
	readonly position: number;
	readonly completed_at: Date | null;
	readonly skipped_at: Date | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeAssignmentItem {
	return {
		id: row.id,
		organizationId: row.organization_id,
		assignmentId: row.assignment_id,
		entityType: row.entity_type,
		entityId: row.entity_id,
		position: row.position,
		completedAt: row.completed_at,
		skippedAt: row.skipped_at,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

// ===========================================================================
// Shared command + request helpers
// ===========================================================================

export interface RouteOptions {
	readonly db: FieldWorkDb;
	readonly authContextMiddleware: MiddlewareHandler<{ Variables: AuthVariables }>;
}

export type CommandsResult = SharedCommandsResult<FieldWorkCommand>;

// ===========================================================================
// Authorization
// ===========================================================================

/**
 * The role check every field-work endpoint runs before writing anything.
 *
 * Returns the 403 response to send, or null to continue — either because the
 * role is sufficient outright or because the rule is an ownership one the write
 * transaction settles against the stored row.
 */
export function denyUnauthorizedCommands(
	context: CommandContext,
	commands: readonly FieldWorkCommand[],
): Response | null {
	const denial = authorizeCommands(context.get('authContext').role, commands);
	return denial === null ? null : context.json(denial, 403);
}

export function readTarget(payload: Record<string, unknown>): {
	readonly type: never;
	readonly id: string;
} {
	return {
		type: (readText(payload.entityType) ?? '') as never,
		id: readText(payload.entityId) ?? '',
	};
}

export function readItemMappings(
	value: unknown,
): readonly { readonly routeItemId: string; readonly assignmentItemId: string }[] {
	if (!Array.isArray(value)) {
		return [];
	}
	return value.map((entry) => ({
		routeItemId: isRecord(entry) ? (readText(entry.routeItemId) ?? '') : '',
		assignmentItemId: isRecord(entry) ? (readText(entry.assignmentItemId) ?? '') : '',
	}));
}

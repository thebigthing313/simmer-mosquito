import { localDateColumn, type SelectedRow, softDelete, updateRow } from '@simmer-mosquito/db';
import type {
	AssignmentItemPlacement,
	FieldWorkCommand,
	RouteItemPlacement,
} from '@simmer-mosquito/domain';
import type { MiddlewareHandler } from 'hono';
import type { AuthVariables } from '../auth-middleware.js';
import {
	type CommandContext,
	commandEndpoint,
	createCommand,
	invalidUpdate,
	organizationCommandContext,
	type CommandsResult as SharedCommandsResult,
} from '../command-endpoint.js';
import { isRecord, readText } from '../command-payload.js';
import {
	type CommandDb,
	type CommandTransaction,
	nowLocalDate,
	readDate,
	readStringArray,
	runCommands,
} from '../command-write.js';

export type FieldWorkDb = CommandDb;
export type FieldWorkTransaction = CommandTransaction;
export {
	type CommandContext,
	commandEndpoint,
	createCommand,
	invalidUpdate,
	localDateColumn,
	nowLocalDate,
	organizationCommandContext,
	readDate,
	readStringArray,
	runCommands,
	softDelete,
	updateRow,
};

// ===========================================================================
// Ordering helpers
// ===========================================================================

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

export type CommentRow = SelectedRow<'comments', typeof commentReturnColumns>;

export const tagItemReturnColumns = [
	'id',
	'organization_id',
	'tag_id',
	'entity_type',
	'entity_id',
	'created_at',
	'updated_at',
] as const;

export type TagItemRow = SelectedRow<'tag_items', typeof tagItemReturnColumns>;

export const additionalPersonnelReturnColumns = [
	'id',
	'organization_id',
	'personnel_profile_id',
	'entity_type',
	'entity_id',
	'created_at',
	'updated_at',
] as const;

export type AdditionalPersonnelRow = SelectedRow<
	'additional_personnel',
	typeof additionalPersonnelReturnColumns
>;

export const routeReturnColumns = [
	'id',
	'organization_id',
	'route_name',
	'route_type',
	'created_at',
	'updated_at',
] as const;

export type RouteRow = SelectedRow<'routes', typeof routeReturnColumns>;

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

export type RouteItemRow = SelectedRow<'route_items', typeof routeItemReturnColumns>;

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

export type AssignmentRow = SelectedRow<'assignments', typeof assignmentReturnColumns>;

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

export type AssignmentItemRow = SelectedRow<'assignment_items', typeof assignmentItemReturnColumns>;

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

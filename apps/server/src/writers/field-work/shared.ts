import { localDateColumn, type SelectedRow, softDelete, updateRow } from '@simmer-mosquito/db';
import type { AssignmentItemPlacement, RouteItemPlacement } from '@simmer-mosquito/domain';
import { type CommandTransaction, nowLocalDate, readDate } from '../../command-write.js';

export type FieldWorkTransaction = CommandTransaction;
export { localDateColumn, nowLocalDate, readDate, softDelete, updateRow };

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

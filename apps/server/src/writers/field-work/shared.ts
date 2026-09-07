import { localDateColumn, softDelete, updateRow } from '@simmer-mosquito/db';
import type { AssignmentItemPlacement, RouteItemPlacement } from '@simmer-mosquito/domain';
import { type CommandTransaction, nowLocalDate, readDate } from '../../command-write.js';
import type { CommandRow } from '../../return-columns.js';

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

export type CommentRow = CommandRow<'comments'>;

export type TagItemRow = CommandRow<'tag_items'>;

export type AdditionalPersonnelRow = CommandRow<'additional_personnel'>;

export type RouteRow = CommandRow<'routes'>;

export type RouteItemRow = CommandRow<'route_items'>;

export type AssignmentRow = CommandRow<'assignments'>;

export type AssignmentItemRow = CommandRow<'assignment_items'>;

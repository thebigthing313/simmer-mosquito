import {
	deletableRecordLabel,
	deletableRecordTable,
	isDeletableRecordType,
	localDateColumn,
	softDelete,
	sql,
	updateRow,
} from '@simmer-mosquito/db';
import type { AssignmentItemPlacement, RouteItemPlacement } from '@simmer-mosquito/domain';
import { CommandError } from '../../command-endpoint.js';
import { type CommandTransaction, readDate } from '../../command-write.js';
import type { CommandRow } from '../../return-columns.js';

export type FieldWorkTransaction = CommandTransaction;
export { localDateColumn, readDate, softDelete, updateRow };

// ===========================================================================
// Support-record targets
// ===========================================================================

/**
 * Refuse a comment or an assisting person on a record this organization cannot
 * name.
 *
 * `entity_type`/`entity_id` is no foreign key, so nothing else asks whether
 * the row is there. It matters most for a Treatment: its support records hang
 * on the Treatment, and a Chemical Application id sent as a `treatment` target
 * would otherwise land on a row no reader looks at (ADR 0020). Every comment
 * and personnel target is a deletable record type, so the deletion registry
 * names its table.
 *
 * A missing row, a soft-deleted one and another organization's read the same,
 * as a 404, so the refusal is no way to probe for ids.
 */
export async function assertSupportTarget(
	trx: FieldWorkTransaction,
	organizationId: string,
	target: { readonly type: string; readonly id: string },
): Promise<void> {
	if (!isDeletableRecordType(target.type)) {
		throw new Error(`No table is registered for the support target ${target.type}.`);
	}
	const found = await sql<{ readonly present: number }>`
		select 1 as present from ${sql.table(deletableRecordTable(target.type))}
		where id = ${target.id}
			and organization_id = ${organizationId}
			and deleted_at is null
		limit 1
	`.execute(trx);
	if (found.rows.length === 0) {
		throw new CommandError(404, {
			error: 'target_not_found',
			reason: `That ${deletableRecordLabel(target.type)} is not available.`,
		});
	}
}

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

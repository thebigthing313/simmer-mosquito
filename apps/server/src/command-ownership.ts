/**
 * The row-level half of command authorization.
 *
 * Some rules cannot be settled from the role alone: a collector may progress
 * *their own* assignment, and an author may correct *their own* comment for a
 * while. Both need the stored row, so they run inside the write transaction
 * rather than at the route boundary.
 *
 * These readers stay free of the per-domain `CommandError` classes and return a
 * verdict instead, so field work and mission dispatch can each raise their own.
 */

import type { SimmerDatabase, Transaction } from '@simmer-mosquito/db';

type CommandTransaction = Transaction<SimmerDatabase>;

export type AssigneeVerdict = 'owner' | 'not_owner' | 'missing';

/** Whether an assignment or mission is assigned to the acting profile. */
export async function readAssigneeOwnership(
	trx: CommandTransaction,
	table: 'assignments' | 'missions',
	id: string,
	organizationId: string,
	actorProfileId: string,
): Promise<AssigneeVerdict> {
	const row = await trx
		.selectFrom(table)
		.select(['assigned_to_profile_id'])
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (row === undefined) {
		return 'missing';
	}
	// An unassigned assignment or mission cannot be executed by a collector —
	// there is nobody it belongs to.
	return row.assigned_to_profile_id === actorProfileId ? 'owner' : 'not_owner';
}

/** The parent assignment or mission an item belongs to, for the same check. */
export async function readItemParentId(
	trx: CommandTransaction,
	table: 'assignment_items' | 'mission_items',
	id: string,
	organizationId: string,
): Promise<string | null> {
	if (table === 'assignment_items') {
		const row = await trx
			.selectFrom('assignment_items')
			.select(['assignment_id'])
			.where('id', '=', id)
			.where('organization_id', '=', organizationId)
			.where('deleted_at', 'is', null)
			.executeTakeFirst();
		return row?.assignment_id ?? null;
	}

	const row = await trx
		.selectFrom('mission_items')
		.select(['mission_id'])
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row?.mission_id ?? null;
}

/**
 * How long a collector may correct their own comment.
 *
 * `docs/field-work-support-domain.md`: "Users may update or delete their own
 * comments within a 30-day correction window. Manager-and-above may update or
 * delete any comment in the organization."
 */
export const COMMENT_CORRECTION_WINDOW_DAYS = 30;

export type CommentVerdict = 'owner' | 'not_author' | 'window_expired' | 'missing';

export async function readCommentOwnership(
	trx: CommandTransaction,
	commentId: string,
	organizationId: string,
	actorProfileId: string,
	now: Date = new Date(),
): Promise<CommentVerdict> {
	const row = await trx
		.selectFrom('comments')
		.select(['commented_by_profile_id', 'commented_at'])
		.where('id', '=', commentId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (row === undefined) {
		return 'missing';
	}
	if (row.commented_by_profile_id !== actorProfileId) {
		return 'not_author';
	}
	return isWithinCorrectionWindow(row.commented_at, now) ? 'owner' : 'window_expired';
}

export function isWithinCorrectionWindow(commentedAt: Date, now: Date): boolean {
	const elapsedDays = (now.getTime() - commentedAt.getTime()) / (24 * 60 * 60 * 1000);
	return elapsedDays <= COMMENT_CORRECTION_WINDOW_DAYS;
}

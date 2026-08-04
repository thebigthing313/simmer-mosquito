/**
 * The row-level half of command authorization.
 *
 * Some rules cannot be settled from the role alone: a collector may progress
 * *their own* assignment, and an author may correct *their own* comment for a
 * while. Both need the stored row, so they run inside the write transaction
 * rather than at the route boundary.
 *
 * `resolveCommandOwnership` is the entry point, and it is driven by the
 * permission map rather than by the handlers: the write loop asks it about every
 * command, so a command whose entry names an ownership rule is checked whether
 * or not its handler remembers to ask. The readers underneath stay free of the
 * per-domain `CommandError` classes and return a verdict instead, so field work
 * and mission dispatch can each raise their own.
 */

import type { SimmerDatabase, Transaction } from '@simmer-mosquito/db';
import type { FieldWorkCommandType, MissionDispatchCommandType } from '@simmer-mosquito/domain';
import {
	type CommandActor,
	type OwnedRecordRef,
	readCommandPermission,
} from './command-permissions.js';

type CommandTransaction = Transaction<SimmerDatabase>;

/** The nouns the 404s are named after: `${entity}_not_found`. */
export type OwnedEntity = 'assignment' | 'assignment_item' | 'mission' | 'mission_item' | 'comment';

export type OwnershipOutcome =
	| { readonly kind: 'allowed' }
	/** The row the rule is about does not exist in this organization. */
	| { readonly kind: 'missing'; readonly entity: OwnedEntity }
	/** It exists and it is not theirs. */
	| { readonly kind: 'refused'; readonly reason: string };

const ALLOWED: OwnershipOutcome = { kind: 'allowed' };

/**
 * Whether this actor may issue this command against the row it names.
 *
 * Answers `allowed` for everything the role already settled — manager-and-above,
 * and every command whose rule is a role floor — so the write loop can call it
 * unconditionally.
 */
export async function resolveCommandOwnership(
	trx: CommandTransaction,
	command: {
		readonly type: FieldWorkCommandType | MissionDispatchCommandType;
		readonly payload: unknown;
	},
	actor: CommandActor,
): Promise<OwnershipOutcome> {
	const permission = readCommandPermission(command.type);
	if (permission.kind !== 'assignedCollector' && permission.kind !== 'author') {
		return ALLOWED;
	}
	// Manager-and-above were allowed outright at the route boundary, and viewers
	// were refused there. Only a collector reaches a rule about their own rows.
	if (actor.role !== 'collector') {
		return ALLOWED;
	}

	const payload = asPayload(command.payload);
	const organizationId = readPayloadId(payload, 'organizationId');
	if (payload === null || organizationId === null) {
		// Commands are built server-side from `agencyCommandContext`, so this is
		// unreachable barring a programming error — and an ownership rule that
		// cannot find its own subject must not resolve to "allowed".
		return { kind: 'refused', reason: 'This command cannot be checked against its record.' };
	}

	return permission.kind === 'author'
		? await resolveCommentOwnership(trx, payload, organizationId, actor)
		: await resolveAssigneeOwnership(trx, permission.owned, payload, organizationId, actor);
}

async function resolveAssigneeOwnership(
	trx: CommandTransaction,
	owned: OwnedRecordRef,
	payload: Record<string, unknown>,
	organizationId: string,
	actor: CommandActor,
): Promise<OwnershipOutcome> {
	const id = readPayloadId(payload, owned.payloadKey);
	if (id === null) {
		return { kind: 'missing', entity: entityOf(owned.table) };
	}

	if (owned.table === 'assignment_items' || owned.table === 'mission_items') {
		const parentId = await readItemParentId(trx, owned.table, id, organizationId);
		if (parentId === null) {
			return { kind: 'missing', entity: entityOf(owned.table) };
		}
		const parentTable = owned.table === 'assignment_items' ? 'assignments' : 'missions';
		return await checkAssignee(trx, parentTable, parentId, organizationId, actor);
	}

	return await checkAssignee(trx, owned.table, id, organizationId, actor);
}

async function checkAssignee(
	trx: CommandTransaction,
	table: 'assignments' | 'missions',
	id: string,
	organizationId: string,
	actor: CommandActor,
): Promise<OwnershipOutcome> {
	const verdict = await readAssigneeOwnership(trx, table, id, organizationId, actor.profileId);
	if (verdict === 'missing') {
		return { kind: 'missing', entity: entityOf(table) };
	}
	if (verdict === 'not_owner') {
		return {
			kind: 'refused',
			reason:
				table === 'assignments'
					? 'Collectors can only work assignments assigned to them.'
					: 'Collectors can only execute missions assigned to them.',
		};
	}
	return ALLOWED;
}

async function resolveCommentOwnership(
	trx: CommandTransaction,
	payload: Record<string, unknown>,
	organizationId: string,
	actor: CommandActor,
): Promise<OwnershipOutcome> {
	const commentId = readPayloadId(payload, 'commentId');
	if (commentId === null) {
		return { kind: 'missing', entity: 'comment' };
	}

	const verdict = await readCommentOwnership(trx, commentId, organizationId, actor.profileId);
	switch (verdict) {
		case 'missing':
			return { kind: 'missing', entity: 'comment' };
		case 'not_author':
			return { kind: 'refused', reason: 'Only the author or a manager can change this comment.' };
		case 'window_expired':
			return {
				kind: 'refused',
				reason: `Comments can only be changed by their author for ${COMMENT_CORRECTION_WINDOW_DAYS} days.`,
			};
		case 'owner':
			return ALLOWED;
	}
}

function entityOf(table: OwnedRecordRef['table']): OwnedEntity {
	switch (table) {
		case 'assignments':
			return 'assignment';
		case 'assignment_items':
			return 'assignment_item';
		case 'missions':
			return 'mission';
		case 'mission_items':
			return 'mission_item';
	}
}

function asPayload(payload: unknown): Record<string, unknown> | null {
	return typeof payload === 'object' && payload !== null
		? (payload as Record<string, unknown>)
		: null;
}

function readPayloadId(payload: Record<string, unknown> | null, key: string): string | null {
	const value = payload?.[key];
	return typeof value === 'string' && value !== '' ? value : null;
}

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

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

import { type SimmerDatabase, sql, type Transaction } from '@simmer-mosquito/db';
import {
	type AgencyCommandType,
	type CommandActor,
	type OwnedRecordRef,
	type PerformedRecordRef,
	readCommandPermission,
} from './command-permissions.js';

type CommandTransaction = Transaction<SimmerDatabase>;

/** The nouns the 404s are named after: `${entity}_not_found`. */
export type OwnedEntity =
	| 'assignment'
	| 'assignment_item'
	| 'mission'
	| 'mission_item'
	| 'comment'
	| 'control_action';

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
		readonly type: AgencyCommandType;
		readonly payload: unknown;
	},
	actor: CommandActor,
): Promise<OwnershipOutcome> {
	const permission = readCommandPermission(command.type);
	if (
		permission.kind !== 'assignedCollector' &&
		permission.kind !== 'author' &&
		permission.kind !== 'performer'
	) {
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

	switch (permission.kind) {
		case 'author':
			return await resolveCommentOwnership(trx, payload, organizationId, actor);
		case 'performer':
			return await resolvePerformerOwnership(
				trx,
				permission.performed,
				payload,
				organizationId,
				actor,
			);
		case 'assignedCollector':
			return await resolveAssigneeOwnership(trx, permission.owned, payload, organizationId, actor);
	}
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

async function resolvePerformerOwnership(
	trx: CommandTransaction,
	performed: PerformedRecordRef,
	payload: Record<string, unknown>,
	organizationId: string,
	actor: CommandActor,
): Promise<OwnershipOutcome> {
	const namedId = readPayloadId(payload, performed.payloadKey);
	if (namedId === null) {
		return { kind: 'missing', entity: 'control_action' };
	}

	const recordId =
		performed.through === undefined
			? namedId
			: await readLinkedParentId(trx, performed.through, namedId, organizationId);
	if (recordId === null) {
		return { kind: 'missing', entity: 'control_action' };
	}

	const verdict = await readPerformerOwnership(
		trx,
		performed,
		recordId,
		organizationId,
		actor.profileId,
	);
	switch (verdict) {
		case 'missing':
			return { kind: 'missing', entity: 'control_action' };
		case 'not_performer':
			return {
				kind: 'refused',
				reason: 'Collectors can only correct control actions they performed.',
			};
		case 'window_expired':
			return {
				kind: 'refused',
				reason: `Control actions can only be corrected by their performer for ${ACTION_CORRECTION_WINDOW_DAYS} days.`,
			};
		case 'owner':
			return ALLOWED;
	}
}

async function readLinkedParentId(
	trx: CommandTransaction,
	through: NonNullable<PerformedRecordRef['through']>,
	id: string,
	organizationId: string,
): Promise<string | null> {
	const row = await trx
		.selectFrom(through.table)
		.select(sql<string>`${sql.ref(through.parentColumn)}`.as('parent_id'))
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row?.parent_id ?? null;
}

/**
 * How long a collector may correct a control action they performed.
 *
 * `docs/control-operations-domain.md`: "collectors can update/delete their own
 * action records within 30 days of the stored action date". Deliberately the
 * same length as the comment window — the two are the same idea about the same
 * people, and two different numbers would only be something to look up.
 */
export const ACTION_CORRECTION_WINDOW_DAYS = 30;

export type PerformerVerdict = 'owner' | 'not_performer' | 'window_expired' | 'missing';

/**
 * Whether a control action was performed by the acting profile, recently enough.
 *
 * The window is measured from the *action date* rather than from when the row
 * was written, because that is what the doc says and because backfilling last
 * month's work should not buy a fresh month to change it in.
 *
 * An action with no performer is nobody's to correct: `technician_profile_id`
 * and `applicator_profile_id` are nullable, and a null there must not match a
 * collector's profile id.
 */
export async function readPerformerOwnership(
	trx: CommandTransaction,
	performed: PerformedRecordRef,
	recordId: string,
	organizationId: string,
	actorProfileId: string,
	now: Date = new Date(),
): Promise<PerformerVerdict> {
	const row = await trx
		.selectFrom(performed.table)
		.select([
			sql<string | null>`${sql.ref(performed.performerColumn)}`.as('performer_id'),
			sql<Date | string>`${sql.ref(performed.performedOnColumn)}`.as('performed_on'),
		])
		.where('id', '=', recordId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (row === undefined) {
		return 'missing';
	}
	if (row.performer_id === null || row.performer_id !== actorProfileId) {
		return 'not_performer';
	}
	return isWithinCorrectionWindow(asDate(row.performed_on), now, ACTION_CORRECTION_WINDOW_DAYS)
		? 'owner'
		: 'window_expired';
}

/**
 * The action tables mix `date` and `timestamptz` columns, and the `date` ones
 * come back as a `YYYY-MM-DD` string. Both have to become a `Date` before the
 * window arithmetic, and a value that parses to nothing is treated as the epoch
 * so an unreadable date expires the window rather than opening it.
 */
function asDate(value: Date | string): Date {
	if (value instanceof Date) {
		return value;
	}
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
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
	return isWithinCorrectionWindow(row.commented_at, now, COMMENT_CORRECTION_WINDOW_DAYS)
		? 'owner'
		: 'window_expired';
}

function isWithinCorrectionWindow(
	recordedAt: Date,
	now: Date,
	windowDays: number = COMMENT_CORRECTION_WINDOW_DAYS,
): boolean {
	const elapsedDays = (now.getTime() - recordedAt.getTime()) / (24 * 60 * 60 * 1000);
	return elapsedDays <= windowDays;
}

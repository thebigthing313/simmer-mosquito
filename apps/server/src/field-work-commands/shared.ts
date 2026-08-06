import {
	type Kysely,
	type MutationWriteResult,
	type SimmerDatabase,
	sql,
	type Transaction,
} from '@simmer-mosquito/db';
import {
	type AssignmentItemPlacement,
	DomainValidationError,
	type FieldWorkCommand,
	type RouteItemPlacement,
} from '@simmer-mosquito/domain';
import type { MiddlewareHandler } from 'hono';
import type { AuthContext } from '../auth-context.js';
import type { AuthVariables } from '../auth-middleware.js';
import { type CommandContext, CommandError, handleCommandError } from '../command-endpoint.js';
import { resolveCommandOwnership } from '../command-ownership.js';
import { isRecord, readText } from '../command-payload.js';
import { authorizeCommands, type CommandActor } from '../command-permissions.js';

export type FieldWorkDb = Kysely<SimmerDatabase>;
export type FieldWorkTransaction = Transaction<SimmerDatabase>;
export { type CommandContext, handleCommandError };

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
// Generic row write helpers
// ===========================================================================

export type WriteTable =
	| 'comments'
	| 'tag_items'
	| 'additional_personnel'
	| 'routes'
	| 'route_items'
	| 'assignments'
	| 'assignment_items';

export async function updateRow<TRow, TSafe>(
	trx: FieldWorkTransaction,
	table: WriteTable,
	id: string,
	organizationId: string,
	set: Record<string, unknown>,
	columns: readonly string[],
	toSafe: (row: TRow) => TSafe,
): Promise<TSafe | null> {
	const row = await trx
		.updateTable(table)
		.set({ ...set, updated_at: sql`now()` } as never)
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(columns as never)
		.executeTakeFirst();
	return row === undefined ? null : toSafe(row as TRow);
}

export async function softDelete<TRow, TSafe>(
	trx: FieldWorkTransaction,
	table: WriteTable,
	id: string,
	organizationId: string,
	actorProfileId: string,
	columns: readonly string[],
	toSafe: (row: TRow) => TSafe,
): Promise<TSafe | null> {
	const row = await trx
		.updateTable(table)
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: actorProfileId,
			updated_by_profile_id: actorProfileId,
			updated_at: sql`now()`,
		} as never)
		.where('id', '=', id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.returning(columns as never)
		.executeTakeFirst();
	return row === undefined ? null : toSafe(row as TRow);
}

/**
 * The write transaction every field-work endpoint commits through.
 *
 * `actor` is required rather than optional so ownership cannot be skipped by
 * omission: every command is checked against the permission map before its
 * handler runs, and a caller that has no actor to pass cannot compile.
 */
export async function writeCommands<TSafe>(
	db: FieldWorkDb,
	actor: CommandActor,
	commands: readonly FieldWorkCommand[],
	write: (trx: FieldWorkTransaction, command: FieldWorkCommand) => Promise<TSafe | null>,
): Promise<MutationWriteResult<TSafe | null>> {
	return db.transaction().execute(async (trx) => {
		let row: TSafe | null = null;
		for (const command of commands) {
			await assertCommandOwnership(trx, command, actor);
			row = await write(trx, command);
		}
		return { row, txid: await readCurrentTransactionId(trx) };
	});
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

export type CommandsResult =
	| { readonly ok: true; readonly commands: readonly FieldWorkCommand[] }
	| { readonly ok: false; readonly body: InvalidCommandBody };

export type InvalidCommandBody = {
	readonly error: 'invalid_command';
	readonly message: string;
	readonly issues: readonly { readonly path: string; readonly message: string }[];
};

export function createCommand<TCommand extends FieldWorkCommand>(
	build: () => TCommand,
):
	| { readonly ok: true; readonly command: TCommand }
	| { readonly ok: false; readonly body: InvalidCommandBody } {
	try {
		return { ok: true, command: build() };
	} catch (error) {
		if (error instanceof DomainValidationError) {
			return {
				ok: false,
				body: { error: 'invalid_command', message: error.message, issues: error.issues },
			};
		}
		throw error;
	}
}

export function invalidUpdate(changeNoun: string): {
	readonly ok: false;
	readonly body: InvalidCommandBody;
} {
	const message = `At least one ${changeNoun} field must change.`;
	return {
		ok: false,
		body: { error: 'invalid_command', message, issues: [{ path: 'changes', message }] },
	};
}

export function agencyCommandContext(authContext: AuthContext) {
	return {
		organizationId: authContext.organization.id,
		actorProfileId: authContext.profile.id,
	};
}

// ===========================================================================
// Authorization
// ===========================================================================

export type { CommandActor };

export function commandActor(authContext: AuthContext): CommandActor {
	return { role: authContext.role, profileId: authContext.profile.id };
}

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

/**
 * The row-level half, raised as this module's `CommandError`.
 *
 * Runs from `writeCommands` for every command rather than from the handlers, so
 * "who may touch this row" is answered by the command's entry in the permission
 * map and not by whether its `case` arm remembered to ask.
 */
async function assertCommandOwnership(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
	actor: CommandActor,
): Promise<void> {
	const outcome = await resolveCommandOwnership(trx, command, actor);
	if (outcome.kind === 'missing') {
		throw new CommandError(404, { error: `${outcome.entity}_not_found` });
	}
	if (outcome.kind === 'refused') {
		throw new CommandError(403, { error: 'forbidden', reason: outcome.reason });
	}
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

export function readStringArray(value: unknown): readonly string[] {
	return Array.isArray(value)
		? value.filter((entry): entry is string => typeof entry === 'string')
		: [];
}

export function localDateColumn(value: string) {
	return sql<Date>`${value}::date`;
}

export function nowLocalDate(): string {
	return new Date().toISOString().slice(0, 10);
}

async function readCurrentTransactionId(trx: FieldWorkTransaction): Promise<number> {
	const result = await sql<{
		txid: string;
	}>`select pg_current_xact_id()::xid::text as txid`.execute(trx);
	const txid = result.rows[0]?.txid;
	if (txid === undefined) {
		throw new Error('Unable to read current transaction id.');
	}
	return Number.parseInt(txid, 10);
}

export type JsonResult =
	| { readonly ok: true; readonly payload: Record<string, unknown> }
	| { readonly ok: false; readonly reason: string };

export async function readJsonObject(request: {
	readonly json: () => Promise<unknown>;
}): Promise<JsonResult> {
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return { ok: false, reason: 'Request body must be JSON.' };
	}
	if (!isRecord(raw)) {
		return { ok: false, reason: 'Request body must be an object.' };
	}
	return { ok: true, payload: raw };
}

export function readDate(value: unknown): Date | null {
	if (typeof value !== 'string' && !(value instanceof Date)) {
		return null;
	}
	const date = value instanceof Date ? value : new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

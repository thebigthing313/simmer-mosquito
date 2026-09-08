import { sql, type Transaction } from 'kysely';

import type { SimmerDatabase } from '../index.js';

/**
 * Folding one record into another is never just the one row.
 *
 * A merge says two rows are the same place or the same person, and picks which
 * spelling survives. The target stays authoritative and keeps every field it
 * has; nothing is blended. What moves is the references: every non-deleted row
 * that named a source now names the target, and the sources are soft-deleted by
 * the caller afterwards.
 *
 * This is the same policy `record-deletion.ts` holds, read the other way. Delete
 * asks "what stops this, and what goes with it"; merge asks "what has to be
 * re-pointed first". They cover the same referencing tables, which is why
 * `src/tests/unit/domains/record-merge.test.ts` holds this registry against that
 * one: a table that gains an `address_id` is a gap in both, and the test fails
 * rather than the merge silently leaving rows behind.
 *
 * They are separate registries because the two policies genuinely disagree on
 * some rows. `mission_notifications.contact_id` blocks a contact delete and is
 * deliberately *not* re-pointed by a contact merge, because those rows are
 * snapshots of who was told, and rewriting them would falsify a record of a
 * notification. A merged rule set would have to encode that exception anyway.
 */
export type MergeableRecordType = 'address' | 'habitat' | 'contact';

/**
 * How one referencing table follows the merge.
 *
 * The two kinds are named as `record-deletion.ts` names them, so the drift test
 * can compare a rule to its twin without translating first. `direct` is a plain
 * foreign key: set it to the target and nothing else changes, so an operational
 * row keeps its own geometry snapshot, dates and audit fields. `polymorphic` is
 * the `entity_type`/`entity_id` pair the support tables use, where the row moves
 * by having its `entity_id` rewritten.
 *
 * `dedupeBy` is what makes a support move safe to repeat. A tag the target
 * already carries, or a route the target is already a stop on, must not end up
 * on the target twice: the columns named here plus the target identify one
 * association, and only one row per key survives. Without it, merging two
 * habitats that share a route would leave that route with two stops at the same
 * place.
 */
export type MergeScope =
	| { readonly kind: 'direct'; readonly column: string }
	| {
			readonly kind: 'polymorphic';
			readonly entityType: string;
			readonly dedupeBy?: readonly string[];
	  };

interface MergeRule {
	/** Stable id for this consequence, so a test and the result can key it. */
	readonly key: string;
	readonly table: string;
	readonly scope: MergeScope;
	/** Domain noun for the rows, for copy that reads like the rest of the app. */
	readonly singular: string;
	readonly plural: string;
}

interface MergeableRecordConfig {
	readonly table: string;
	readonly singular: string;
	readonly plural: string;
	readonly rules: readonly MergeRule[];
}

/** One referencing table's share of a merge, and how many rows it was. */
export interface MergeMoveEntry {
	readonly key: string;
	/** Rows now naming the target that named a source before. */
	readonly moved: number;
	/**
	 * Rows soft-deleted because the target already had the same association.
	 * Always zero for a rule with no `dedupeBy`.
	 */
	readonly deduped: number;
	readonly singular: string;
	readonly plural: string;
}

export interface MergeImpact {
	readonly recordType: MergeableRecordType;
	readonly targetId: string;
	readonly sourceIds: readonly string[];
	/** Per referencing table, non-zero entries only. */
	readonly moves: readonly MergeMoveEntry[];
}

/**
 * Thrown when the rows a merge names are not a set that can be merged.
 *
 * The domain builder already refuses a target listed as its own source and a
 * missing acknowledgement. Everything here needs the database: whether the rows
 * exist, belong to this organization, are still live, and, for habitats,
 * whether the survivor is active.
 */
export class RecordMergeRefusedError extends Error {
	readonly recordType: MergeableRecordType;
	readonly reason: MergeRefusalReason;
	/** The rows the refusal is about, when it is about particular rows. */
	readonly recordIds: readonly string[];

	constructor(
		recordType: MergeableRecordType,
		reason: MergeRefusalReason,
		recordIds: readonly string[],
		message: string,
	) {
		super(message);
		this.name = 'RecordMergeRefusedError';
		this.recordType = recordType;
		this.reason = reason;
		this.recordIds = recordIds;
	}
}

export type MergeRefusalReason = 'target_not_found' | 'source_not_found' | 'target_inactive';

// ---------------------------------------------------------------------------
// Rule shorthands
// ---------------------------------------------------------------------------

function repoints(
	key: string,
	table: string,
	column: string,
	singular: string,
	plural: string,
): MergeRule {
	return { key, table, scope: { kind: 'direct', column }, singular, plural };
}

function moves(
	key: string,
	table: string,
	entityType: string,
	singular: string,
	plural: string,
): MergeRule {
	return { key, table, scope: { kind: 'polymorphic', entityType }, singular, plural };
}

/** A support move where the target may already hold the same association. */
function movesDeduped(
	key: string,
	table: string,
	entityType: string,
	dedupeBy: readonly string[],
	singular: string,
	plural: string,
): MergeRule {
	return { key, table, scope: { kind: 'polymorphic', entityType, dedupeBy }, singular, plural };
}

// ---------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------

const MERGEABLE_RECORDS: Record<MergeableRecordType, MergeableRecordConfig> = {
	/**
	 * The twelve tables that block an address delete are the twelve a merge
	 * re-points. That is the whole difference between the two commands: delete
	 * refuses while anything names the address, merge gives those rows somewhere
	 * else to name.
	 */
	address: {
		table: 'addresses',
		singular: 'address',
		plural: 'addresses',
		rules: [
			repoints('addressTraps', 'traps', 'address_id', 'trap', 'traps'),
			repoints('addressCollections', 'collections', 'address_id', 'collection', 'collections'),
			repoints('addressHabitats', 'habitats', 'address_id', 'habitat', 'habitats'),
			repoints('addressInspections', 'inspections', 'address_id', 'inspection', 'inspections'),
			repoints(
				'addressApplications',
				'applications',
				'address_id',
				'chemical application',
				'chemical applications',
			),
			repoints(
				'addressSourceReductions',
				'source_reductions',
				'address_id',
				'source reduction',
				'source reductions',
			),
			repoints(
				'addressOutreachActions',
				'outreach_actions',
				'address_id',
				'outreach action',
				'outreach actions',
			),
			repoints(
				'addressBiocontrolActions',
				'biocontrol_actions',
				'address_id',
				'biocontrol action',
				'biocontrol actions',
			),
			repoints(
				'addressControlRequests',
				'requested_control_actions',
				'address_id',
				'control request',
				'control requests',
			),
			repoints(
				'addressServiceRequests',
				'service_requests',
				'address_id',
				'service request',
				'service requests',
			),
			repoints(
				'addressNotificationRegistrations',
				'notification_registrations',
				'address_id',
				'notification registration',
				'notification registrations',
			),
			repoints(
				'addressMissionItems',
				'mission_items',
				'address_id',
				'mission stop',
				'mission stops',
			),
			moves('addressComments', 'comments', 'address', 'comment', 'comments'),
			movesDeduped('addressTags', 'tag_items', 'address', ['tag_id'], 'tag', 'tags'),
		],
	},

	/**
	 * Habitat references detach on delete rather than block, and re-point on
	 * merge, which is the same set of tables again.
	 *
	 * The route and assignment stops are why `dedupeBy` exists. Two habitats on
	 * one route are two stops; merged, they are one place, and the surviving stop
	 * has to be the target's existing one so that its position and its directions
	 * to the next stop are the ones the crew already drives.
	 *
	 * `docs/larval-surveillance-domain.md` also lists direct habitat additional
	 * personnel. There is no such row to move: `ADDITIONAL_PERSONNEL_TARGET_TYPES`
	 * is the six work records, and a habitat is not one of them.
	 */
	habitat: {
		table: 'habitats',
		singular: 'habitat',
		plural: 'habitats',
		rules: [
			repoints('habitatInspections', 'inspections', 'habitat_id', 'inspection', 'inspections'),
			repoints(
				'habitatApplications',
				'applications',
				'habitat_id',
				'chemical application',
				'chemical applications',
			),
			repoints(
				'habitatSourceReductions',
				'source_reductions',
				'habitat_id',
				'source reduction',
				'source reductions',
			),
			repoints(
				'habitatBiocontrolActions',
				'biocontrol_actions',
				'habitat_id',
				'biocontrol action',
				'biocontrol actions',
			),
			repoints(
				'habitatControlRequests',
				'requested_control_actions',
				'habitat_id',
				'control request',
				'control requests',
			),
			moves('habitatComments', 'comments', 'habitat', 'comment', 'comments'),
			movesDeduped('habitatTags', 'tag_items', 'habitat', ['tag_id'], 'tag', 'tags'),
			movesDeduped(
				'habitatRouteItems',
				'route_items',
				'habitat',
				['route_id'],
				'route stop',
				'route stops',
			),
			movesDeduped(
				'habitatAssignmentItems',
				'assignment_items',
				'habitat',
				['assignment_id'],
				'assignment stop',
				'assignment stops',
			),
		],
	},

	/**
	 * `mission_notifications.contact_id` is deliberately absent.
	 *
	 * It blocks a contact delete, so the delete registry names it, but a merge
	 * leaves it alone: those rows record who was told about a mission, with the
	 * contact and destination as they were at the time. Re-pointing them would
	 * rewrite history rather than tidy it.
	 */
	contact: {
		table: 'contacts',
		singular: 'contact',
		plural: 'contacts',
		rules: [
			repoints(
				'contactServiceRequests',
				'service_requests',
				'contact_id',
				'service request',
				'service requests',
			),
			repoints(
				'contactNotificationRegistrations',
				'notification_registrations',
				'contact_id',
				'notification registration',
				'notification registrations',
			),
			moves('contactComments', 'comments', 'contact', 'comment', 'comments'),
			movesDeduped('contactTags', 'tag_items', 'contact', ['tag_id'], 'tag', 'tags'),
		],
	},
};

/**
 * The registry as data, for the test that holds it against the delete registry.
 *
 * Returns the referencing tables and how each is reached, without the SQL or the
 * copy. Enough to compare two policies that must cover the same ground.
 */
export function mergeReferenceScopes(
	recordType: MergeableRecordType,
): readonly { readonly table: string; readonly scope: MergeScope }[] {
	return MERGEABLE_RECORDS[recordType].rules.map((rule) => ({
		table: rule.table,
		scope: rule.scope,
	}));
}

export function isMergeableRecordType(value: string): value is MergeableRecordType {
	return Object.hasOwn(MERGEABLE_RECORDS, value);
}

/** The domain noun for the record itself, for confirmation copy. */
export function mergeableRecordLabel(recordType: MergeableRecordType): string {
	return MERGEABLE_RECORDS[recordType].singular;
}

// ---------------------------------------------------------------------------
// SQL
// ---------------------------------------------------------------------------

/**
 * How many rows an update touched.
 *
 * Read off the driver rather than from `returning id`, because the ids are not
 * wanted. A big address merge moves every trap, habitat, inspection and service
 * request that named the retired addresses, and returning them would ship that
 * whole set back to count the length of it.
 *
 * `numAffectedRows` is a `bigint`, and these counts are small enough to be
 * numbers by the time anyone reads one.
 */
function rowsAffected(result: { readonly numAffectedRows?: bigint }): number {
	return Number(result.numAffectedRows ?? 0n);
}

/** Who touched the row and when, on every write a merge makes. */
function auditUpdate(actorProfileId: string | null) {
	return sql`updated_by_profile_id = ${actorProfileId}, updated_at = now()`;
}

function sourceMatch(scope: MergeScope, sourceIds: readonly string[]) {
	// `::uuid[]` because the driver sends a JS array as `text[]`, and Postgres will
	// not compare that to a uuid column. Every `= any(...)` in this package casts.
	const ids = [...sourceIds];
	return scope.kind === 'direct'
		? sql`${sql.ref(scope.column)} = any(${ids}::uuid[])`
		: sql`entity_type = ${scope.entityType} and entity_id = any(${ids}::uuid[])`;
}

/**
 * Retire the support rows a move would duplicate, and say how many.
 *
 * One row survives per `dedupeBy` key across the target and every source, and
 * the target's own row is the one that survives when it has one, because
 * `entity_id = target` sorts first, so a route keeps the stop it already had, at
 * the position it already had. Ordering by `created_at` then `id` after that makes the choice
 * between two sources stable rather than whatever Postgres returns first.
 *
 * This runs before the move, so the rows it deletes are still identifiable by
 * their source `entity_id`.
 */
async function dedupeSupportRows(
	trx: Transaction<SimmerDatabase>,
	rule: MergeRule,
	scope: Extract<MergeScope, { kind: 'polymorphic' }>,
	dedupeBy: readonly string[],
	input: MergeInput,
): Promise<number> {
	const partition = sql.join(dedupeBy.map((column) => sql.ref(column)));
	const result = await sql`
		update ${sql.table(rule.table)}
		set deleted_at = now(),
			deleted_by_profile_id = ${input.actorProfileId},
			${auditUpdate(input.actorProfileId)}
		where id in (
			select id from (
				select id, row_number() over (
					partition by ${partition}
					order by (entity_id = ${input.targetId}) desc, created_at, id
				) as rank
				from ${sql.table(rule.table)}
				where entity_type = ${scope.entityType}
					and entity_id = any(${[input.targetId, ...input.sourceIds]}::uuid[])
					and organization_id = ${input.organizationId}
					and deleted_at is null
			) as ranked
			where ranked.rank > 1
		)
	`.execute(trx);
	return rowsAffected(result);
}

/** Point one referencing table's rows at the target. */
async function applyRule(
	trx: Transaction<SimmerDatabase>,
	rule: MergeRule,
	input: MergeInput,
): Promise<MergeMoveEntry> {
	const scope = rule.scope;
	const deduped =
		scope.kind === 'polymorphic' && scope.dedupeBy !== undefined && scope.dedupeBy.length > 0
			? await dedupeSupportRows(trx, rule, scope, scope.dedupeBy, input)
			: 0;

	const set =
		scope.kind === 'direct'
			? sql`${sql.ref(scope.column)} = ${input.targetId}, ${auditUpdate(input.actorProfileId)}`
			: sql`entity_id = ${input.targetId}, ${auditUpdate(input.actorProfileId)}`;

	const result = await sql`
		update ${sql.table(rule.table)}
		set ${set}
		where ${sourceMatch(scope, input.sourceIds)}
			and organization_id = ${input.organizationId}
			and deleted_at is null
	`.execute(trx);

	return {
		key: rule.key,
		moved: rowsAffected(result),
		deduped,
		singular: rule.singular,
		plural: rule.plural,
	};
}

/**
 * Which of these ids are this organization's live rows.
 *
 * One query rather than one per id, and it answers with the ids it found so the
 * caller can name the ones it did not. A row belonging to another organization
 * is reported missing rather than forbidden: the answer must not tell an
 * organization that another organization's record exists.
 */
async function liveIds(
	trx: Transaction<SimmerDatabase>,
	table: string,
	ids: readonly string[],
	organizationId: string,
): Promise<ReadonlySet<string>> {
	if (ids.length === 0) {
		return new Set();
	}
	const result = await sql<{ readonly id: string }>`
		select id from ${sql.table(table)}
		where id = any(${[...ids]}::uuid[])
			and organization_id = ${organizationId}
			and deleted_at is null
	`.execute(trx);
	return new Set(result.rows.map((row) => row.id));
}

export interface MergeInput {
	readonly recordType: MergeableRecordType;
	readonly targetId: string;
	readonly sourceIds: readonly string[];
	readonly organizationId: string;
	readonly actorProfileId: string | null;
}

/**
 * Run the record's merge policy inside the caller's transaction.
 *
 * Call this before soft-deleting the sources: every rule reads rows by their
 * source id, and a source that is already deleted is not one of them.
 *
 * The sources are not touched here. Retiring them is the caller's own soft
 * delete, in the same transaction, for the same reason the delete helper leaves
 * the record itself alone: the writer owns the row it returns.
 *
 * @throws RecordMergeRefusedError when the target or a source is not a live row
 * of this organization, or the target is inactive.
 */
export async function applyRecordMerge(
	trx: Transaction<SimmerDatabase>,
	input: MergeInput,
): Promise<MergeImpact> {
	const config = MERGEABLE_RECORDS[input.recordType];
	const label = config.singular;

	const found = await liveIds(
		trx,
		config.table,
		[input.targetId, ...input.sourceIds],
		input.organizationId,
	);

	if (!found.has(input.targetId)) {
		throw new RecordMergeRefusedError(
			input.recordType,
			'target_not_found',
			[input.targetId],
			`The ${label} being merged into was not found.`,
		);
	}

	const missing = input.sourceIds.filter((id) => !found.has(id));
	if (missing.length > 0) {
		throw new RecordMergeRefusedError(
			input.recordType,
			'source_not_found',
			missing,
			missing.length === 1
				? `One of the ${config.plural} being merged was not found.`
				: `${missing.length} of the ${config.plural} being merged were not found.`,
		);
	}

	await requireActiveTarget(trx, input, config);

	const moves: MergeMoveEntry[] = [];
	for (const rule of config.rules) {
		const entry = await applyRule(trx, rule, input);
		if (entry.moved > 0 || entry.deduped > 0) {
			moves.push(entry);
		}
	}

	return {
		recordType: input.recordType,
		targetId: input.targetId,
		sourceIds: input.sourceIds,
		moves,
	};
}

/**
 * Habitats only.
 *
 * `docs/larval-surveillance-domain.md` requires the surviving habitat to be
 * active and allows the sources to be either. Addresses and contacts have no
 * `is_active` column, so there is nothing to ask about them.
 */
async function requireActiveTarget(
	trx: Transaction<SimmerDatabase>,
	input: MergeInput,
	config: MergeableRecordConfig,
): Promise<void> {
	if (input.recordType !== 'habitat') {
		return;
	}
	const result = await sql<{ readonly is_active: boolean }>`
		select is_active from ${sql.table(config.table)}
		where id = ${input.targetId} and organization_id = ${input.organizationId}
	`.execute(trx);
	if (result.rows[0]?.is_active !== true) {
		throw new RecordMergeRefusedError(
			input.recordType,
			'target_inactive',
			[input.targetId],
			'The habitat being merged into must be active.',
		);
	}
}

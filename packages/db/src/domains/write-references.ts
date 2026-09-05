import { type RawBuilder, sql } from 'kysely';

import type { DbExecutor } from '../index.js';
import { type DeletableRecordType, deletableRecordTable } from './record-deletion.js';

/*
 * May this row be referenced right now?
 *
 * The forward half of the question `record-deletion.ts` asks backwards. A
 * delete asks whether anything refers to a row; a write asks whether it may
 * refer to one. They are the same rule seen from two ends, which is why they
 * share a module boundary and a registry rather than being a delete fix plus
 * `is_active` checks written writer by writer.
 *
 * Two kinds of reference, one rule apart:
 *
 * - A **catalog** reference qualifies when the row belongs to the writing
 *   organization, is not soft-deleted, and is active.
 * - A **record** reference qualifies on the first two. There is no `is_active`
 *   on an Inspection or an Address, and no meaning for one: an operational
 *   record is not something an organization retires from use.
 *
 * The organization half used to be nobody's job for either. A foreign key
 * satisfies itself on the row existing anywhere, so it cannot see
 * `organization_id` and cannot see `deleted_at`. #123 closed that for the
 * catalogs, because its forward gate had to load the row to read `is_active`
 * and refusing another organization's id cost nothing once it had it. #200 is
 * the rest: an Address, a Habitat, a Profile, a Contact still took their id
 * from the payload with nothing checking whose it was.
 */

/** The catalogs, as data: the coverage test walks this list. */
const CATALOG_RECORD_TYPES = [
	'collectionMethod',
	'collectionLure',
	'habitatType',
	'applicationMethod',
	'sourceReductionMethod',
	'outreachMethod',
	'biocontrolMethod',
	'vehicle',
	'equipment',
	'insecticide',
	'insecticideBatch',
	'formulation',
	'notificationType',
	'tag',
] as const satisfies readonly DeletableRecordType[];

export type CatalogRecordType = (typeof CATALOG_RECORD_TYPES)[number];

/**
 * `catalog-coverage.integration.test.ts` walks this to ask the live schema
 * whether every foreign key pointing at a catalog has a rule.
 */
export function catalogRecordTypes(): readonly CatalogRecordType[] {
	return CATALOG_RECORD_TYPES;
}

/**
 * The tables a command body may name an id in, other than the catalogs.
 *
 * Every one is organization-owned and soft-deleting, which is what makes the
 * same two-column query answer for it.
 * `write-reference-coverage.integration.test.ts` asks the live schema to
 * confirm both, so a table added here without an `organization_id` fails rather
 * than gating on a column that is not there.
 *
 * Global tables are deliberately absent. `species`, `genera` and `units` have
 * no `organization_id` and are shared by every organization, so there is no
 * organization question to ask of them.
 *
 * So are the two weather tables, for a subtler reason. `weather_sources` and
 * `weather_summaries` carry a *nullable* `organization_id`, kept that way for a
 * provider-owned station with no organization behind it. `organization_id = $1`
 * compares unequal to null, so this gate would refuse a global station rather
 * than allow it. `weather-commands/shared.ts` writes that predicate out itself
 * and every weather writer reads its station through it.
 */
const REFERENCED_RECORD_TABLES = [
	'addresses',
	'applications',
	'assignment_items',
	'assignments',
	'collections',
	'contacts',
	'habitats',
	'inspections',
	'mission_items',
	'missions',
	'notification_registrations',
	'profiles',
	'region_folders',
	'requested_control_actions',
	'routes',
	'samples',
	'traps',
] as const;

export type ReferencedRecordTable = (typeof REFERENCED_RECORD_TABLES)[number];

/** The coverage test walks this list. */
export function referencedRecordTables(): readonly ReferencedRecordTable[] {
	return REFERENCED_RECORD_TABLES;
}

/**
 * Every foreign key column a command body can name a record in, and the domain
 * noun a refusal calls it.
 *
 * Keyed by column rather than by table because the writers hand this the row
 * they are about to write, and a column is what a row has. The schema allows
 * that: no column name in it points at two different organization-owned tables,
 * which `write-reference-coverage.integration.test.ts` asks Postgres to
 * confirm.
 *
 * The three attribution columns are deliberately absent. `created_by_profile_id`,
 * `updated_by_profile_id` and `deleted_by_profile_id` are written from the
 * session's `AuthContext`, never from a payload, so there is no id to doubt.
 *
 * A column pointing at a catalog is absent too. Those are gated by name at the
 * writer, with the `is_active` rule #123 settled and the two documented
 * exceptions, and folding them in here would silently overrule both.
 */
const RECORD_REFERENCE_COLUMNS = {
	address_id: { record: 'addresses', label: 'address' },
	application_id: { record: 'applications', label: 'chemical application' },
	applicator_profile_id: { record: 'profiles', label: 'applicator' },
	assigned_by_profile_id: { record: 'profiles', label: 'profile' },
	assigned_to_profile_id: { record: 'profiles', label: 'assignee' },
	assignment_id: { record: 'assignments', label: 'assignment' },
	assignment_item_id: { record: 'assignment_items', label: 'assignment item' },
	closed_by_profile_id: { record: 'profiles', label: 'profile' },
	collected_assignment_item_id: { record: 'assignment_items', label: 'assignment item' },
	collected_by_profile_id: { record: 'profiles', label: 'collector' },
	collection_id: { record: 'collections', label: 'collection' },
	commented_by_profile_id: { record: 'profiles', label: 'profile' },
	completed_by_profile_id: { record: 'profiles', label: 'profile' },
	contact_id: { record: 'contacts', label: 'contact' },
	habitat_id: { record: 'habitats', label: 'habitat' },
	identified_by_profile_id: { record: 'profiles', label: 'identifier' },
	inspected_by_profile_id: { record: 'profiles', label: 'inspector' },
	inspection_id: { record: 'inspections', label: 'inspection' },
	mission_id: { record: 'missions', label: 'mission' },
	mission_item_id: { record: 'mission_items', label: 'mission item' },
	notification_registration_id: {
		record: 'notification_registrations',
		label: 'notification registration',
	},
	personnel_profile_id: { record: 'profiles', label: 'person' },
	profile_id: { record: 'profiles', label: 'profile' },
	received_by_profile_id: { record: 'profiles', label: 'profile' },
	region_folder_id: { record: 'region_folders', label: 'folder' },
	requested_by_profile_id: { record: 'profiles', label: 'profile' },
	requested_control_action_id: {
		record: 'requested_control_actions',
		label: 'requested control action',
	},
	resolved_by_profile_id: { record: 'profiles', label: 'profile' },
	route_id: { record: 'routes', label: 'route' },
	sample_id: { record: 'samples', label: 'sample' },
	set_assignment_item_id: { record: 'assignment_items', label: 'assignment item' },
	set_by_profile_id: { record: 'profiles', label: 'profile' },
	skipped_by_profile_id: { record: 'profiles', label: 'profile' },
	status_changed_by_profile_id: { record: 'profiles', label: 'profile' },
	technician_profile_id: { record: 'profiles', label: 'technician' },
	trap_id: { record: 'traps', label: 'trap' },
} as const satisfies Record<string, { record: ReferencedRecordTable; label: string }>;

/** The coverage test walks this to hold the registry against the live schema. */
export function recordReferenceColumns(): ReadonlyMap<string, ReferencedRecordTable> {
	return new Map(
		Object.entries(RECORD_REFERENCE_COLUMNS).map(([column, entry]) => [column, entry.record]),
	);
}

/**
 * The record references a row's own columns name.
 *
 * Taken from the values a writer is about to insert or the patch it is about to
 * set, rather than from a hand-written list per writer. Two properties follow
 * from that and neither is available to a list: a reference cannot be forgotten
 * once the column is being written, and a reference cannot name a column the
 * table does not have — which matters, because the update path reads the stored
 * value back and a column that is not there is an error rather than a miss.
 *
 * Only string values are references. A `RawBuilder` is geometry or `now()`, and
 * `null` is the field being cleared, which names no row to check.
 */
export function recordReferencesIn(values: Record<string, unknown>): RecordReference[] {
	const references: RecordReference[] = [];

	for (const [column, entry] of Object.entries(RECORD_REFERENCE_COLUMNS)) {
		const value = values[column];
		if (typeof value === 'string') {
			references.push({ column, record: entry.record, id: value, label: entry.label });
		}
	}

	return references;
}

/**
 * The values, once every record id in them is one this organization may name.
 *
 * Wraps an insert's own object rather than sitting on the line above it, so the
 * gate and the row it guards cannot drift apart:
 *
 * ```ts
 * .values(await checkedValues(trx, organizationId, { … }))
 * ```
 *
 * Updates do not need it. `updateRow` is the one seam every update goes
 * through and it runs the same check on the patch, with the stored row read
 * back so an unchanged reference is not refused.
 *
 * @throws ReferenceRefusedError on the first reference that fails.
 */
export async function checkedValues<TValues extends Record<string, unknown>>(
	db: DbExecutor,
	organizationId: string,
	values: TValues,
): Promise<TValues> {
	await assertWriteReferences(db, {
		organizationId,
		write: { kind: 'create' },
		references: recordReferencesIn(values),
	});
	return values;
}

export type ReferenceReason = 'missing' | 'inactive';

/** Thrown when a write named a row it may not use. */
export class ReferenceRefusedError extends Error {
	/** The catalog record type or the table, whichever kind the reference was. */
	readonly reference: CatalogRecordType | ReferencedRecordTable;
	readonly reason: ReferenceReason;
	readonly label: string;

	constructor(
		reference: CatalogRecordType | ReferencedRecordTable,
		reason: ReferenceReason,
		label: string,
	) {
		super(
			reason === 'inactive'
				? `That ${label} is inactive and cannot be used on new records. Reactivate it first, or pick another.`
				: `That ${label} is not available.`,
		);
		this.name = 'ReferenceRefusedError';
		this.reference = reference;
		this.reason = reason;
		this.label = label;
	}
}

export interface ReferenceBase {
	/** The column on the row being written. Used to read what is already stored. */
	readonly column: string;
	/** The id being written, or null when the field is being cleared. */
	readonly id: string | null;
	/** Domain noun for the refusal copy, lowercase: `insecticide`, `lure`. */
	readonly label: string;
}

export interface CatalogReference extends ReferenceBase {
	readonly catalog: CatalogRecordType;
}

export interface RecordReference extends ReferenceBase {
	readonly record: ReferencedRecordTable;
}

/**
 * One id a write names, and what it has to be.
 *
 * `catalog` and `record` are the discriminant. They are separate fields rather
 * than a `kind` plus a name because the two carry different vocabularies: a
 * catalog is a `DeletableRecordType` and shares the delete registry's table
 * lookup, and a record is a table name.
 */
export type WriteReference = CatalogReference | RecordReference;

interface ReferenceRowState {
	readonly is_active: boolean;
}

/**
 * Which write this is.
 *
 * A create gates every reference it names. An update reads the stored row and
 * gates only the references whose value **changes**, so a full-record PATCH
 * against a historical record stays editable after its product retires. That is
 * the difference between "you may not start using this" and "you may never
 * touch this record again".
 *
 * The two carry different data, so they are a union rather than a pair of
 * optional fields. Optional fields let a caller pass the table and forget the
 * id, and the gate would quietly fall back to gating unchanged values, which is
 * the one failure here that shows up only once something is deactivated in
 * production.
 */
export type CatalogWrite =
	| { readonly kind: 'create' }
	| { readonly kind: 'update'; readonly table: string; readonly recordId: string };

/**
 * Refuse a write that names a row it may not use.
 *
 * @throws ReferenceRefusedError on the first reference that fails.
 */
export async function assertWriteReferences(
	db: DbExecutor,
	input: {
		readonly organizationId: string;
		readonly write: CatalogWrite;
		readonly references: readonly WriteReference[];
	},
): Promise<void> {
	const named = input.references.filter((reference) => reference.id !== null);
	if (named.length === 0) {
		return;
	}

	const unchanged =
		input.write.kind === 'create'
			? new Set<string>()
			: await readStoredReferences(
					db,
					input.write.table,
					input.write.recordId,
					input.organizationId,
					named,
				);

	const changed = named.filter((reference) => !unchanged.has(reference.column));
	if (changed.length === 0) {
		return;
	}

	const states = await readReferencedRows(db, input.organizationId, changed);
	for (const reference of changed) {
		const state = states.get(referenceKey(reference));
		if (state === undefined) {
			throw new ReferenceRefusedError(referenceName(reference), 'missing', reference.label);
		}
		if (!state.is_active) {
			throw new ReferenceRefusedError(referenceName(reference), 'inactive', reference.label);
		}
	}
}

function referenceName(reference: WriteReference): CatalogRecordType | ReferencedRecordTable {
	return 'catalog' in reference ? reference.catalog : reference.record;
}

function referenceTable(reference: WriteReference): string {
	return 'catalog' in reference ? deletableRecordTable(reference.catalog) : reference.record;
}

function referenceKey(reference: WriteReference): string {
	return `${referenceName(reference)}:${reference.id}`;
}

/**
 * Which of the references already hold the value stored on the record.
 *
 * One read by primary key. A record that is missing or another organization's
 * returns nothing, so every reference counts as changed and the check runs; the
 * write itself is scoped by `organization_id` and will find no row to update.
 */
async function readStoredReferences(
	db: DbExecutor,
	table: string,
	recordId: string,
	organizationId: string,
	references: readonly WriteReference[],
): Promise<ReadonlySet<string>> {
	const columns = [...new Set(references.map((reference) => reference.column))];
	const selected = sql.join(columns.map((column) => sql.ref(column)));

	const result = await sql<Record<string, string | null>>`
		select ${selected}
		from ${sql.table(table)}
		where id = ${recordId} and organization_id = ${organizationId} and deleted_at is null
		limit 1
	`.execute(db);

	const stored = result.rows[0];
	if (stored === undefined) {
		return new Set();
	}

	return new Set(
		references
			.filter((reference) => stored[reference.column] === reference.id)
			.map((reference) => reference.column),
	);
}

/**
 * Every referenced row's state in one round-trip.
 *
 * A `union all` of one-row selects rather than a query per reference: a chemical
 * application names four catalogs and five records, and this runs on every
 * create and every edit that moves one of them.
 *
 * A record table has no `is_active`, so its arm selects `true` and the caller's
 * inactive branch is unreachable for it. That keeps one result shape and one
 * loop rather than two of each.
 */
async function readReferencedRows(
	db: DbExecutor,
	organizationId: string,
	references: readonly WriteReference[],
): Promise<ReadonlyMap<string, ReferenceRowState>> {
	const parts: RawBuilder<unknown>[] = references.map(
		(reference) => sql`
			select ${referenceKey(reference)}::text as key, ${
				'catalog' in reference ? sql.ref('is_active') : sql`true`
			} as is_active
			from ${sql.table(referenceTable(reference))}
			where id = ${reference.id}
				and organization_id = ${organizationId}
				and deleted_at is null
		`,
	);

	const result = await sql<{ readonly key: string; readonly is_active: boolean }>`${sql.join(
		parts,
		sql` union all `,
	)}`.execute(db);

	return new Map(result.rows.map((row) => [row.key, { is_active: row.is_active }]));
}

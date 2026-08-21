import { type RawBuilder, sql } from 'kysely';

import type { DbExecutor } from '../index.js';
import { type DeletableRecordType, deletableRecordTable } from './record-deletion.js';

/**
 * May this catalog row be referenced right now?
 *
 * The forward half of the question `record-deletion.ts` asks backwards. A
 * delete asks whether anything refers to a row; a write asks whether it may
 * refer to one. They are the same rule seen from two ends, which is why they
 * share a module boundary and a registry rather than being a delete fix plus
 * `is_active` checks written writer by writer.
 *
 * A row qualifies when all three hold:
 *
 * - it belongs to the writing agency,
 * - it is not soft-deleted,
 * - it is active.
 *
 * The first two used to be nobody's job. A foreign key satisfies itself on the
 * row existing anywhere, so it cannot see `organization_id` and cannot see
 * `deleted_at`; the third was never checked at all, and Deactivate meant only
 * that the client-side pickers stopped offering the row.
 *
 * The refusal does not distinguish a missing row from another agency's, because
 * telling them apart would turn this into a way to probe for ids.
 */
export type CatalogRecordType = Extract<
	DeletableRecordType,
	| 'collectionMethod'
	| 'collectionLure'
	| 'habitatType'
	| 'applicationMethod'
	| 'sourceReductionMethod'
	| 'outreachMethod'
	| 'biocontrolMethod'
	| 'vehicle'
	| 'equipment'
	| 'insecticide'
	| 'insecticideBatch'
	| 'formulation'
	| 'notificationType'
	| 'tag'
>;

export type CatalogReferenceReason = 'missing' | 'inactive';

/** Thrown when a write named a catalog row it may not use. */
export class CatalogReferenceRefusedError extends Error {
	readonly catalog: CatalogRecordType;
	readonly reason: CatalogReferenceReason;
	readonly label: string;

	constructor(catalog: CatalogRecordType, reason: CatalogReferenceReason, label: string) {
		super(
			reason === 'inactive'
				? `That ${label} is inactive and cannot be used on new records. Reactivate it first, or pick another.`
				: `That ${label} is not available.`,
		);
		this.name = 'CatalogReferenceRefusedError';
		this.catalog = catalog;
		this.reason = reason;
		this.label = label;
	}
}

export interface CatalogReference {
	/** The column on the row being written. Used to read what is already stored. */
	readonly column: string;
	readonly catalog: CatalogRecordType;
	/** The id being written, or null when the field is being cleared. */
	readonly id: string | null;
	/** Domain noun for the refusal copy, lowercase: `insecticide`, `lure`. */
	readonly label: string;
}

interface CatalogRowState {
	readonly is_active: boolean;
}

/**
 * Refuse a write that names a catalog row it may not use.
 *
 * Pass `recordId` on an update and omit it on a create. On an update the stored
 * row is read once and any reference already holding that value is skipped, so
 * a full-record PATCH against a historical record stays editable after its
 * product retires. Only a reference whose value **changes** is gated, which is
 * the difference between "you may not start using this" and "you may never
 * touch this record again".
 *
 * A caller that gates on the payload id without this comparison will refuse
 * unchanged values, and nothing will show it until something is deactivated in
 * production.
 *
 * @throws CatalogReferenceRefusedError on the first reference that fails.
 */
export async function assertCatalogReferences(
	db: DbExecutor,
	input: {
		readonly organizationId: string;
		/** The table being written, needed only to read the stored row. */
		readonly table?: string;
		readonly recordId?: string | undefined;
		readonly references: readonly CatalogReference[];
	},
): Promise<void> {
	const named = input.references.filter((reference) => reference.id !== null);
	if (named.length === 0) {
		return;
	}

	const unchanged =
		input.recordId === undefined || input.table === undefined
			? new Set<string>()
			: await readStoredReferences(db, input.table, input.recordId, input.organizationId, named);

	const changed = named.filter((reference) => !unchanged.has(reference.column));
	if (changed.length === 0) {
		return;
	}

	const states = await readCatalogRows(db, input.organizationId, changed);
	for (const reference of changed) {
		const state = states.get(`${reference.catalog}:${reference.id}`);
		if (state === undefined) {
			throw new CatalogReferenceRefusedError(reference.catalog, 'missing', reference.label);
		}
		if (!state.is_active) {
			throw new CatalogReferenceRefusedError(reference.catalog, 'inactive', reference.label);
		}
	}
}

/**
 * Which of the references already hold the value stored on the record.
 *
 * One read by primary key. A record that is missing or another agency's returns
 * nothing, so every reference counts as changed and the catalog check runs; the
 * write itself is scoped by `organization_id` and will find no row to update.
 */
async function readStoredReferences(
	db: DbExecutor,
	table: string,
	recordId: string,
	organizationId: string,
	references: readonly CatalogReference[],
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
 * Every referenced catalog row's state in one round-trip.
 *
 * A `union all` of one-row selects rather than a query per reference: a chemical
 * application names four catalogs, and this runs on every create and every edit
 * that moves one of them.
 */
async function readCatalogRows(
	db: DbExecutor,
	organizationId: string,
	references: readonly CatalogReference[],
): Promise<ReadonlyMap<string, CatalogRowState>> {
	const parts: RawBuilder<unknown>[] = references.map(
		(reference) => sql`
			select ${`${reference.catalog}:${reference.id}`}::text as key, is_active
			from ${sql.table(deletableRecordTable(reference.catalog))}
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

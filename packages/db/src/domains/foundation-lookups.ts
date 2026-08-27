import { type Kysely, sql } from 'kysely';

import type { DbExecutor, MutationWriteResult, SimmerDatabase } from '../index.js';
import type { SelectedRow } from './org-owned-writes.js';
import { assertRecordDeletable } from './record-deletion.js';

export type OrgLookupKind = 'collection_methods' | 'collection_lures' | 'habitat_types';

export interface CreateOrgLookupInput {
	readonly id?: string;
	readonly organizationId: string;
	readonly name: string;
	readonly description?: string | null;
	readonly customSchema?: unknown | null;
	readonly actionThreshold?: number | null;
	readonly isActive?: boolean;
	readonly createdByProfileId?: string | null;
	readonly updatedByProfileId?: string | null;
}

/**
 * The camelCase row the operator console reads. `listOrgLookups` is the only
 * thing that still answers it; the writes below answer their own columns, so a
 * lure no longer comes back carrying the `custom_schema` and `action_threshold`
 * it has no column for.
 */
export interface SafeOrgLookup {
	readonly id: string;
	readonly organizationId: string;
	readonly name: string;
	readonly description: string | null;
	readonly customSchema: unknown | null;
	readonly actionThreshold: number | null;
	readonly isActive: boolean;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

const lookupSharedColumns = ['id', 'organization_id', 'name', 'description'] as const;

const lookupTrailingColumns = [
	'is_active',
	'created_by_profile_id',
	'updated_by_profile_id',
	'created_at',
	'updated_at',
] as const;

export const collectionMethodReturnColumns = [
	...lookupSharedColumns,
	'custom_schema',
	'action_threshold',
	...lookupTrailingColumns,
] as const;

export const collectionLureReturnColumns = [
	...lookupSharedColumns,
	...lookupTrailingColumns,
] as const;

export const habitatTypeReturnColumns = [
	...lookupSharedColumns,
	'custom_schema',
	...lookupTrailingColumns,
] as const;

export type CollectionMethodRow = SelectedRow<
	'collection_methods',
	typeof collectionMethodReturnColumns
>;
export type CollectionLureRow = SelectedRow<'collection_lures', typeof collectionLureReturnColumns>;
export type HabitatTypeRow = SelectedRow<'habitat_types', typeof habitatTypeReturnColumns>;

/**
 * What a write to any of the three catalogs answers with.
 *
 * A union rather than one widened shape: the three tables genuinely differ, and
 * `createOrgLookup` picks the table from its `kind` argument, so the caller that
 * knows which catalog it asked for is the one that can narrow it.
 */
export type OrgLookupRow = CollectionMethodRow | CollectionLureRow | HabitatTypeRow;

/** Which of the three a `kind` means, so `createOrgLookup` narrows for a caller. */
export type OrgLookupRowFor<TKind extends OrgLookupKind> = {
	readonly collection_methods: CollectionMethodRow;
	readonly collection_lures: CollectionLureRow;
	readonly habitat_types: HabitatTypeRow;
}[TKind];

export interface UpdateCollectionMethodLookupInput {
	readonly organizationId: string;
	readonly name?: string;
	readonly description?: string | null;
	readonly customSchema?: unknown | null;
	readonly actionThreshold?: number | null;
	readonly updatedByProfileId?: string | null;
}

export interface CollectionMethodLookupLifecycleInput {
	readonly organizationId: string;
	readonly actorProfileId?: string | null;
}

export interface UpdateCollectionLureLookupInput {
	readonly organizationId: string;
	readonly name?: string;
	readonly description?: string | null;
	readonly updatedByProfileId?: string | null;
}

export interface CollectionLureLookupLifecycleInput {
	readonly organizationId: string;
	readonly actorProfileId?: string | null;
}

export interface UpdateHabitatTypeLookupInput {
	readonly organizationId: string;
	readonly name?: string;
	readonly description?: string | null;
	readonly customSchema?: unknown | null;
	readonly updatedByProfileId?: string | null;
}

export interface HabitatTypeLookupLifecycleInput {
	readonly organizationId: string;
	readonly actorProfileId?: string | null;
}

/**
 * The three casts below are what a `kind` argument costs. Each branch selects
 * its own catalog's columns, so the row is right; what the compiler cannot do is
 * tie the branch it took to the `TKind` the caller passed.
 */
export async function createOrgLookup<TKind extends OrgLookupKind>(
	db: DbExecutor,
	kind: TKind,
	input: CreateOrgLookupInput,
): Promise<OrgLookupRowFor<TKind>> {
	if (kind === 'collection_methods') {
		const row = await db
			.insertInto('collection_methods')
			.values({
				...(input.id === undefined ? {} : { id: input.id }),
				organization_id: input.organizationId,
				name: input.name,
				description: input.description ?? null,
				custom_schema: input.customSchema ?? null,
				action_threshold: input.actionThreshold ?? null,
				is_active: input.isActive ?? true,
				created_by_profile_id: input.createdByProfileId ?? null,
				updated_by_profile_id: input.updatedByProfileId ?? input.createdByProfileId ?? null,
			})
			.returning(collectionMethodReturnColumns)
			.executeTakeFirstOrThrow();

		return row as OrgLookupRowFor<TKind>;
	}

	if (kind === 'collection_lures') {
		const row = await db
			.insertInto('collection_lures')
			.values({
				...(input.id === undefined ? {} : { id: input.id }),
				organization_id: input.organizationId,
				name: input.name,
				description: input.description ?? null,
				is_active: input.isActive ?? true,
				created_by_profile_id: input.createdByProfileId ?? null,
				updated_by_profile_id: input.updatedByProfileId ?? input.createdByProfileId ?? null,
			})
			.returning(collectionLureReturnColumns)
			.executeTakeFirstOrThrow();

		return row as OrgLookupRowFor<TKind>;
	}

	const row = await db
		.insertInto('habitat_types')
		.values({
			...(input.id === undefined ? {} : { id: input.id }),
			organization_id: input.organizationId,
			name: input.name,
			description: input.description ?? null,
			custom_schema: input.customSchema ?? null,
			is_active: input.isActive ?? true,
			created_by_profile_id: input.createdByProfileId ?? null,
			updated_by_profile_id: input.updatedByProfileId ?? input.createdByProfileId ?? null,
		})
		.returning(habitatTypeReturnColumns)
		.executeTakeFirstOrThrow();

	return row as OrgLookupRowFor<TKind>;
}

export async function listOrgLookups(
	db: DbExecutor,
	kind: OrgLookupKind,
	organizationId: string,
): Promise<SafeOrgLookup[]> {
	if (kind === 'collection_methods') {
		const rows = await db
			.selectFrom('collection_methods')
			.select([
				'id',
				'organization_id',
				'name',
				'description',
				'custom_schema',
				'action_threshold',
				'is_active',
				'created_by_profile_id',
				'updated_by_profile_id',
				'created_at',
				'updated_at',
			])
			.where('organization_id', '=', organizationId)
			.where('deleted_at', 'is', null)
			.orderBy('name', 'asc')
			.execute();

		return rows.map(toSafeOrgLookup);
	}

	if (kind === 'collection_lures') {
		const rows = await db
			.selectFrom('collection_lures')
			.select([
				'id',
				'organization_id',
				'name',
				'description',
				'is_active',
				'created_by_profile_id',
				'updated_by_profile_id',
				'created_at',
				'updated_at',
			])
			.where('organization_id', '=', organizationId)
			.where('deleted_at', 'is', null)
			.orderBy('name', 'asc')
			.execute();

		return rows.map((row) => toSafeOrgLookup({ ...row, custom_schema: null }));
	}

	const rows = await db
		.selectFrom('habitat_types')
		.select([
			'id',
			'organization_id',
			'name',
			'description',
			'custom_schema',
			'is_active',
			'created_by_profile_id',
			'updated_by_profile_id',
			'created_at',
			'updated_at',
		])
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.orderBy('name', 'asc')
		.execute();

	return rows.map(toSafeOrgLookup);
}

export async function createCollectionMethodLookupWithTxid(
	db: Kysely<SimmerDatabase>,
	input: CreateOrgLookupInput & { readonly id: string },
): Promise<MutationWriteResult<CollectionMethodRow>> {
	return db.transaction().execute(async (trx) => {
		const row = await createOrgLookup(trx, 'collection_methods', input);
		const txid = await readCurrentTransactionId(trx);
		return { row, txid };
	});
}

export async function updateCollectionMethodLookup(
	db: DbExecutor,
	collectionMethodId: string,
	input: UpdateCollectionMethodLookupInput,
): Promise<CollectionMethodRow | null> {
	const row = await db
		.updateTable('collection_methods')
		.set({
			...(input.name === undefined ? {} : { name: input.name }),
			...(input.description === undefined ? {} : { description: input.description }),
			...(input.customSchema === undefined ? {} : { custom_schema: input.customSchema }),
			...(input.actionThreshold === undefined ? {} : { action_threshold: input.actionThreshold }),
			updated_by_profile_id: input.updatedByProfileId ?? null,
			updated_at: sql`now()`,
		})
		.where('id', '=', collectionMethodId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(collectionMethodReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

export async function updateCollectionMethodLookupWithTxid(
	db: Kysely<SimmerDatabase>,
	collectionMethodId: string,
	input: UpdateCollectionMethodLookupInput,
): Promise<MutationWriteResult<CollectionMethodRow | null>> {
	return db.transaction().execute(async (trx) => {
		const row = await updateCollectionMethodLookup(trx, collectionMethodId, input);
		const txid = await readCurrentTransactionId(trx);
		return { row, txid };
	});
}

export async function setCollectionMethodLookupActive(
	db: DbExecutor,
	collectionMethodId: string,
	input: CollectionMethodLookupLifecycleInput & { readonly isActive: boolean },
): Promise<CollectionMethodRow | null> {
	const row = await db
		.updateTable('collection_methods')
		.set({
			is_active: input.isActive,
			updated_by_profile_id: input.actorProfileId ?? null,
			updated_at: sql`now()`,
		})
		.where('id', '=', collectionMethodId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(collectionMethodReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

export async function deleteCollectionMethodLookup(
	db: DbExecutor,
	collectionMethodId: string,
	input: CollectionMethodLookupLifecycleInput,
): Promise<CollectionMethodRow | null> {
	await assertRecordDeletable(db, {
		recordType: 'collectionMethod',
		recordId: collectionMethodId,
		organizationId: input.organizationId,
	});

	const row = await db
		.updateTable('collection_methods')
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: input.actorProfileId ?? null,
			updated_by_profile_id: input.actorProfileId ?? null,
			updated_at: sql`now()`,
		})
		.where('id', '=', collectionMethodId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(collectionMethodReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

export async function updateCollectionLureLookup(
	db: DbExecutor,
	collectionLureId: string,
	input: UpdateCollectionLureLookupInput,
): Promise<CollectionLureRow | null> {
	const row = await db
		.updateTable('collection_lures')
		.set({
			...(input.name === undefined ? {} : { name: input.name }),
			...(input.description === undefined ? {} : { description: input.description }),
			updated_by_profile_id: input.updatedByProfileId ?? null,
			updated_at: sql`now()`,
		})
		.where('id', '=', collectionLureId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(collectionLureReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

export async function setCollectionLureLookupActive(
	db: DbExecutor,
	collectionLureId: string,
	input: CollectionLureLookupLifecycleInput & { readonly isActive: boolean },
): Promise<CollectionLureRow | null> {
	const row = await db
		.updateTable('collection_lures')
		.set({
			is_active: input.isActive,
			updated_by_profile_id: input.actorProfileId ?? null,
			updated_at: sql`now()`,
		})
		.where('id', '=', collectionLureId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(collectionLureReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

export async function deleteCollectionLureLookup(
	db: DbExecutor,
	collectionLureId: string,
	input: CollectionLureLookupLifecycleInput,
): Promise<CollectionLureRow | null> {
	await assertRecordDeletable(db, {
		recordType: 'collectionLure',
		recordId: collectionLureId,
		organizationId: input.organizationId,
	});

	const row = await db
		.updateTable('collection_lures')
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: input.actorProfileId ?? null,
			updated_by_profile_id: input.actorProfileId ?? null,
			updated_at: sql`now()`,
		})
		.where('id', '=', collectionLureId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(collectionLureReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

export async function updateHabitatTypeLookup(
	db: DbExecutor,
	habitatTypeId: string,
	input: UpdateHabitatTypeLookupInput,
): Promise<HabitatTypeRow | null> {
	const row = await db
		.updateTable('habitat_types')
		.set({
			...(input.name === undefined ? {} : { name: input.name }),
			...(input.description === undefined ? {} : { description: input.description }),
			...(input.customSchema === undefined ? {} : { custom_schema: input.customSchema }),
			updated_by_profile_id: input.updatedByProfileId ?? null,
			updated_at: sql`now()`,
		})
		.where('id', '=', habitatTypeId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(habitatTypeReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

export async function setHabitatTypeLookupActive(
	db: DbExecutor,
	habitatTypeId: string,
	input: HabitatTypeLookupLifecycleInput & { readonly isActive: boolean },
): Promise<HabitatTypeRow | null> {
	const row = await db
		.updateTable('habitat_types')
		.set({
			is_active: input.isActive,
			updated_by_profile_id: input.actorProfileId ?? null,
			updated_at: sql`now()`,
		})
		.where('id', '=', habitatTypeId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(habitatTypeReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

export async function deleteHabitatTypeLookup(
	db: DbExecutor,
	habitatTypeId: string,
	input: HabitatTypeLookupLifecycleInput,
): Promise<HabitatTypeRow | null> {
	await assertRecordDeletable(db, {
		recordType: 'habitatType',
		recordId: habitatTypeId,
		organizationId: input.organizationId,
	});

	const row = await db
		.updateTable('habitat_types')
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: input.actorProfileId ?? null,
			updated_by_profile_id: input.actorProfileId ?? null,
			updated_at: sql`now()`,
		})
		.where('id', '=', habitatTypeId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning(habitatTypeReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

async function readCurrentTransactionId(db: DbExecutor): Promise<number> {
	const result = await sql<{
		txid: string;
	}>`select pg_current_xact_id()::xid::text as txid`.execute(db);
	const txid = result.rows[0]?.txid;
	if (txid === undefined) {
		throw new Error('Unable to read current transaction id.');
	}

	return Number.parseInt(txid, 10);
}

function toSafeOrgLookup(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly name: string;
	readonly description: string | null;
	readonly custom_schema: unknown | null;
	readonly action_threshold?: number | null;
	readonly is_active: boolean;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeOrgLookup {
	return {
		id: row.id,
		organizationId: row.organization_id,
		name: row.name,
		description: row.description,
		customSchema: row.custom_schema,
		actionThreshold: row.action_threshold ?? null,
		isActive: row.is_active,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

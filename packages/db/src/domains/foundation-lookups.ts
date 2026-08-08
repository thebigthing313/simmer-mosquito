import { type Kysely, sql, type Transaction } from 'kysely';

import type { DbExecutor, MutationWriteResult, SimmerDatabase } from '../index.js';

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

export async function createOrgLookup(
	db: DbExecutor,
	kind: OrgLookupKind,
	input: CreateOrgLookupInput,
): Promise<SafeOrgLookup> {
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
			.returning([
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
			.executeTakeFirstOrThrow();

		return toSafeOrgLookup(row);
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
			.returning([
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
			.executeTakeFirstOrThrow();

		return toSafeOrgLookup({ ...row, custom_schema: null });
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
		.returning([
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
		.executeTakeFirstOrThrow();

	return toSafeOrgLookup(row);
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
): Promise<MutationWriteResult<SafeOrgLookup>> {
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
): Promise<SafeOrgLookup | null> {
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
		.returning([
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
		.executeTakeFirst();

	return row === undefined ? null : toSafeOrgLookup(row);
}

export async function updateCollectionMethodLookupWithTxid(
	db: Kysely<SimmerDatabase>,
	collectionMethodId: string,
	input: UpdateCollectionMethodLookupInput,
): Promise<MutationWriteResult<SafeOrgLookup | null>> {
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
): Promise<SafeOrgLookup | null> {
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
		.returning([
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
		.executeTakeFirst();

	return row === undefined ? null : toSafeOrgLookup(row);
}

export async function deleteCollectionMethodLookup(
	db: DbExecutor,
	collectionMethodId: string,
	input: CollectionMethodLookupLifecycleInput,
): Promise<SafeOrgLookup | null> {
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
		.returning([
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
		.executeTakeFirst();

	return row === undefined ? null : toSafeOrgLookup(row);
}

export async function updateCollectionLureLookup(
	db: DbExecutor,
	collectionLureId: string,
	input: UpdateCollectionLureLookupInput,
): Promise<SafeOrgLookup | null> {
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
		.returning([
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
		.executeTakeFirst();

	return row === undefined ? null : toSafeOrgLookup({ ...row, custom_schema: null });
}

export async function setCollectionLureLookupActive(
	db: DbExecutor,
	collectionLureId: string,
	input: CollectionLureLookupLifecycleInput & { readonly isActive: boolean },
): Promise<SafeOrgLookup | null> {
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
		.returning([
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
		.executeTakeFirst();

	return row === undefined ? null : toSafeOrgLookup({ ...row, custom_schema: null });
}

export async function deleteCollectionLureLookup(
	db: DbExecutor,
	collectionLureId: string,
	input: CollectionLureLookupLifecycleInput,
): Promise<SafeOrgLookup | null> {
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
		.returning([
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
		.executeTakeFirst();

	return row === undefined ? null : toSafeOrgLookup({ ...row, custom_schema: null });
}

export async function updateHabitatTypeLookup(
	db: DbExecutor,
	habitatTypeId: string,
	input: UpdateHabitatTypeLookupInput,
): Promise<SafeOrgLookup | null> {
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
		.returning([
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
		.executeTakeFirst();

	return row === undefined ? null : toSafeOrgLookup(row);
}

export async function setHabitatTypeLookupActive(
	db: DbExecutor,
	habitatTypeId: string,
	input: HabitatTypeLookupLifecycleInput & { readonly isActive: boolean },
): Promise<SafeOrgLookup | null> {
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
		.returning([
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
		.executeTakeFirst();

	return row === undefined ? null : toSafeOrgLookup(row);
}

export async function deleteHabitatTypeLookup(
	db: DbExecutor,
	habitatTypeId: string,
	input: HabitatTypeLookupLifecycleInput,
): Promise<SafeOrgLookup | null> {
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
		.returning([
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
		.executeTakeFirst();

	return row === undefined ? null : toSafeOrgLookup(row);
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

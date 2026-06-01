import { type Kysely, sql, type Transaction } from 'kysely';

import type { MutationWriteResult, SimmerDatabase } from '../index.js';

export interface CreateTagInput {
	readonly id?: string;
	readonly organizationId: string;
	readonly tagName: string;
	readonly description?: string | null;
	readonly color?: string | null;
	readonly isActive?: boolean;
	readonly createdByProfileId?: string | null;
	readonly updatedByProfileId?: string | null;
}

export interface UpdateTagInput {
	readonly organizationId: string;
	readonly tagName?: string;
	readonly description?: string | null;
	readonly color?: string | null;
	readonly updatedByProfileId?: string | null;
}

export interface TagLifecycleInput {
	readonly organizationId: string;
	readonly actorProfileId?: string | null;
}

export interface SafeTag {
	readonly id: string;
	readonly organizationId: string;
	readonly tagName: string;
	readonly description: string | null;
	readonly color: string | null;
	readonly isActive: boolean;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

type DbExecutor = Kysely<SimmerDatabase> | Transaction<SimmerDatabase>;

export async function createTag(db: DbExecutor, input: CreateTagInput): Promise<SafeTag> {
	const row = await db
		.insertInto('tags')
		.values({
			...(input.id === undefined ? {} : { id: input.id }),
			organization_id: input.organizationId,
			tag_name: input.tagName,
			description: input.description ?? null,
			color: input.color ?? null,
			is_active: input.isActive ?? true,
			created_by_profile_id: input.createdByProfileId ?? null,
			updated_by_profile_id: input.updatedByProfileId ?? input.createdByProfileId ?? null,
		})
		.returning([
			'id',
			'organization_id',
			'tag_name',
			'description',
			'color',
			'is_active',
			'created_by_profile_id',
			'updated_by_profile_id',
			'created_at',
			'updated_at',
		])
		.executeTakeFirstOrThrow();

	return toSafeTag(row);
}

export async function updateTag(
	db: DbExecutor,
	tagId: string,
	input: UpdateTagInput,
): Promise<SafeTag | null> {
	const row = await db
		.updateTable('tags')
		.set({
			...(input.tagName === undefined ? {} : { tag_name: input.tagName }),
			...(input.description === undefined ? {} : { description: input.description }),
			...(input.color === undefined ? {} : { color: input.color }),
			updated_by_profile_id: input.updatedByProfileId ?? null,
			updated_at: sql`now()`,
		})
		.where('id', '=', tagId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning([
			'id',
			'organization_id',
			'tag_name',
			'description',
			'color',
			'is_active',
			'created_by_profile_id',
			'updated_by_profile_id',
			'created_at',
			'updated_at',
		])
		.executeTakeFirst();

	return row === undefined ? null : toSafeTag(row);
}

export async function setTagActive(
	db: DbExecutor,
	tagId: string,
	input: TagLifecycleInput & { readonly isActive: boolean },
): Promise<SafeTag | null> {
	const row = await db
		.updateTable('tags')
		.set({
			is_active: input.isActive,
			updated_by_profile_id: input.actorProfileId ?? null,
			updated_at: sql`now()`,
		})
		.where('id', '=', tagId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning([
			'id',
			'organization_id',
			'tag_name',
			'description',
			'color',
			'is_active',
			'created_by_profile_id',
			'updated_by_profile_id',
			'created_at',
			'updated_at',
		])
		.executeTakeFirst();

	return row === undefined ? null : toSafeTag(row);
}

export async function deleteTag(
	db: DbExecutor,
	tagId: string,
	input: TagLifecycleInput,
): Promise<SafeTag | null> {
	const row = await db
		.updateTable('tags')
		.set({
			deleted_at: sql`now()`,
			deleted_by_profile_id: input.actorProfileId ?? null,
			updated_by_profile_id: input.actorProfileId ?? null,
			updated_at: sql`now()`,
		})
		.where('id', '=', tagId)
		.where('organization_id', '=', input.organizationId)
		.where('deleted_at', 'is', null)
		.returning([
			'id',
			'organization_id',
			'tag_name',
			'description',
			'color',
			'is_active',
			'created_by_profile_id',
			'updated_by_profile_id',
			'created_at',
			'updated_at',
		])
		.executeTakeFirst();

	return row === undefined ? null : toSafeTag(row);
}

export async function writeTagCommandsWithTxid(
	db: Kysely<SimmerDatabase>,
	write: (trx: Transaction<SimmerDatabase>) => Promise<SafeTag | null>,
): Promise<MutationWriteResult<SafeTag | null>> {
	return db.transaction().execute(async (trx) => {
		const row = await write(trx);
		const txid = await readCurrentTransactionId(trx);
		return { row, txid };
	});
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

function toSafeTag(row: {
	readonly id: string;
	readonly organization_id: string;
	readonly tag_name: string;
	readonly description: string | null;
	readonly color: string | null;
	readonly is_active: boolean;
	readonly created_by_profile_id: string | null;
	readonly updated_by_profile_id: string | null;
	readonly created_at: Date;
	readonly updated_at: Date;
}): SafeTag {
	return {
		id: row.id,
		organizationId: row.organization_id,
		tagName: row.tag_name,
		description: row.description,
		color: row.color,
		isActive: row.is_active,
		createdByProfileId: row.created_by_profile_id,
		updatedByProfileId: row.updated_by_profile_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

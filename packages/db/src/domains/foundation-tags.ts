import { sql } from 'kysely';

import type { DbExecutor } from '../index.js';
import type { SelectedRow } from './org-owned-writes.js';
import { assertRecordDeletable } from './record-deletion.js';

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

export const tagReturnColumns = [
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
] as const;

export type TagRow = SelectedRow<'tags', typeof tagReturnColumns>;

export async function createTag(db: DbExecutor, input: CreateTagInput): Promise<TagRow> {
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
		.returning(tagReturnColumns)
		.executeTakeFirstOrThrow();

	return row;
}

export async function updateTag(
	db: DbExecutor,
	tagId: string,
	input: UpdateTagInput,
): Promise<TagRow | null> {
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
		.returning(tagReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

export async function setTagActive(
	db: DbExecutor,
	tagId: string,
	input: TagLifecycleInput & { readonly isActive: boolean },
): Promise<TagRow | null> {
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
		.returning(tagReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

export async function deleteTag(
	db: DbExecutor,
	tagId: string,
	input: TagLifecycleInput,
): Promise<TagRow | null> {
	await assertRecordDeletable(db, {
		recordType: 'tag',
		recordId: tagId,
		organizationId: input.organizationId,
	});

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
		.returning(tagReturnColumns)
		.executeTakeFirst();

	return row ?? null;
}

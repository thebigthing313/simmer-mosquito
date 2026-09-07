import { assertWriteReferences } from '@simmer-mosquito/db';
import { type FieldWorkCommand, toDbEntityType } from '@simmer-mosquito/domain';
import {
	type FieldWorkTransaction,
	softDelete,
	type TagItemRow,
	tagItemReturnColumns,
} from './shared.js';

// ===========================================================================
// Tag items
// ===========================================================================

export async function writeTagItemCommand(
	trx: FieldWorkTransaction,
	command: FieldWorkCommand,
): Promise<TagItemRow | null> {
	switch (command.type) {
		case 'fieldWork.assignTag': {
			await assertWriteReferences(trx, {
				organizationId: command.payload.organizationId,
				write: { kind: 'create' },
				references: [{ column: 'tag_id', catalog: 'tag', id: command.payload.tagId, label: 'tag' }],
			});
			const row = await trx
				.insertInto('tag_items')
				.values({
					id: command.payload.tagItemId,
					organization_id: command.payload.organizationId,
					tag_id: command.payload.tagId,
					entity_type: toDbEntityType(command.payload.target.type),
					entity_id: command.payload.target.id,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(tagItemReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'fieldWork.unassignTag':
			return softDelete(
				trx,
				'tag_items',
				command.payload.tagItemId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				tagItemReturnColumns,
			);
		default:
			throw new Error(`Unsupported tag item command: ${command.type}`);
	}
}

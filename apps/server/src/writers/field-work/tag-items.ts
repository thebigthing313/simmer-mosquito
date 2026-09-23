import { assertWriteReferences } from '@simmer-mosquito/db';
import { type FieldWorkCommand, toDbEntityType } from '@simmer-mosquito/domain';
import { refusableWrite } from '../../command-endpoint.js';
import { returnColumns } from '../../return-columns.js';
import { type FieldWorkTransaction, softDelete, type TagItemRow } from './shared.js';

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
			// `tag_items` carries a partial unique index on
			// `(tag_id, entity_type, entity_id) where deleted_at is null`, which fires
			// when two people tick the same box or one person ticks it on two devices.
			// Unhandled that is a 500 with an unreadable body under a checkbox that
			// silently un-ticks itself.
			//
			// Not idempotent: swallowing the collision would return a row whose id the
			// client never minted, so the optimistic row and the row Electric streams
			// back would be two rows for one assignment. The refusal is what the client
			// toasts, while the other client's row arrives by sync and the chip stays.
			const row = await refusableWrite(
				() =>
					trx
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
						.returning(returnColumns.tag_items)
						.executeTakeFirstOrThrow(),
				{
					duplicate: {
						error: 'tag_already_assigned',
						reason: 'This tag is already on this record.',
					},
				},
			);
			return row;
		}
		case 'fieldWork.unassignTag':
			return softDelete(
				trx,
				'tag_items',
				command.payload.tagItemId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				returnColumns.tag_items,
			);
		default:
			throw new Error(`Unsupported tag item command: ${command.type}`);
	}
}

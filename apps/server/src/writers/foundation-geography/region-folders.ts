import { applyRecordDeletion } from '@simmer-mosquito/db';
import type { FoundationCommand } from '@simmer-mosquito/domain';
import {
	type FoundationTransaction,
	type RegionFolderRow,
	regionFolderReturnColumns,
	softDelete,
	updateRow,
} from './shared.js';

// ===========================================================================
// Region folders
// ===========================================================================

/** Exported for `table-commands/regions.ts` — see `writeRegionCommand`. */
export async function writeRegionFolderCommand(
	trx: FoundationTransaction,
	command: FoundationCommand,
): Promise<RegionFolderRow | null> {
	switch (command.type) {
		case 'foundation.createRegionFolder': {
			const row = await trx
				.insertInto('region_folders')
				.values({
					id: command.payload.regionFolderId,
					organization_id: command.payload.organizationId,
					name: command.payload.name,
					description: command.payload.description,
					created_by_profile_id: command.payload.actorProfileId,
					updated_by_profile_id: command.payload.actorProfileId,
				})
				.returning(regionFolderReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'foundation.updateRegionFolder':
			return updateRow(
				trx,
				'region_folders',
				command.payload.regionFolderId,
				command.payload.organizationId,
				{
					...('name' in command.payload.changes ? { name: command.payload.changes.name } : {}),
					...('description' in command.payload.changes
						? { description: command.payload.changes.description ?? null }
						: {}),
					updated_by_profile_id: command.payload.actorProfileId,
				},
				regionFolderReturnColumns,
			);
		case 'foundation.deleteRegionFolder':
			// Unfiles the folder's regions before the folder goes. Without it the
			// regions kept a `region_folder_id` pointing at a deleted row, and the
			// delete never asked about them.
			await applyRecordDeletion(trx, {
				recordType: 'regionFolder',
				recordId: command.payload.regionFolderId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				acknowledged: {
					acknowledgedRegionDetach: command.payload.acknowledgedRegionDetach,
				},
			});
			return softDelete(
				trx,
				'region_folders',
				command.payload.regionFolderId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				regionFolderReturnColumns,
			);
		default:
			throw new Error(`Unsupported region folder command: ${command.type}`);
	}
}

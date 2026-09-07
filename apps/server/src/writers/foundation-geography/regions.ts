import { applyRecordDeletion, checkedValues } from '@simmer-mosquito/db';
import type { FoundationCommand } from '@simmer-mosquito/domain';
import {
	type FoundationTransaction,
	geojsonToGeom,
	type RegionRow,
	regionReturnColumns,
	softDelete,
	updateRow,
} from './shared.js';

// ===========================================================================
// Regions
// ===========================================================================

/**
 * Exported for `table-commands/regions.ts`, which serves the same five commands
 * at `/commands/regions`. One writer, so the two surfaces cannot write a region
 * differently; only the choosing differs.
 */
export async function writeRegionCommand(
	trx: FoundationTransaction,
	command: FoundationCommand,
): Promise<RegionRow | null> {
	switch (command.type) {
		case 'foundation.createRegion': {
			const row = await trx
				.insertInto('regions')
				.values(
					await checkedValues(trx, command.payload.organizationId, {
						id: command.payload.regionId,
						organization_id: command.payload.organizationId,
						region_folder_id: command.payload.regionFolderId,
						geom: geojsonToGeom(command.payload.geometry),
						name: command.payload.name,
						description: command.payload.description,
						metadata: command.payload.metadata,
						created_by_profile_id: command.payload.actorProfileId,
						updated_by_profile_id: command.payload.actorProfileId,
					}),
				)
				.returning(regionReturnColumns)
				.executeTakeFirstOrThrow();
			return row;
		}
		case 'foundation.updateRegionDetails':
			return updateRegion(trx, command.payload.regionId, command.payload.organizationId, {
				...('name' in command.payload.changes ? { name: command.payload.changes.name } : {}),
				...('description' in command.payload.changes
					? { description: command.payload.changes.description ?? null }
					: {}),
				...('metadata' in command.payload.changes
					? { metadata: command.payload.changes.metadata ?? null }
					: {}),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'foundation.moveRegionToFolder':
			return updateRegion(trx, command.payload.regionId, command.payload.organizationId, {
				region_folder_id: command.payload.regionFolderId,
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'foundation.updateRegionGeometry':
			return updateRegion(trx, command.payload.regionId, command.payload.organizationId, {
				geom: geojsonToGeom(command.payload.geometry),
				updated_by_profile_id: command.payload.actorProfileId,
			});
		case 'foundation.deleteRegion':
			await applyRecordDeletion(trx, {
				recordType: 'region',
				recordId: command.payload.regionId,
				organizationId: command.payload.organizationId,
				actorProfileId: command.payload.actorProfileId,
				// Nothing to confirm: a region's only consequences are its own
				// comments and tags, which the registry performs unasked.
				// `acknowledgedRegionDelete` is the domain builder's, and it is about
				// meaning to delete rather than about what the delete reaches.
				acknowledged: {},
			});
			return softDelete(
				trx,
				'regions',
				command.payload.regionId,
				command.payload.organizationId,
				command.payload.actorProfileId,
				regionReturnColumns,
			);
		default:
			throw new Error(`Unsupported region command: ${command.type}`);
	}
}

async function updateRegion(
	trx: FoundationTransaction,
	regionId: string,
	organizationId: string,
	set: Record<string, unknown>,
): Promise<RegionRow | null> {
	return updateRow(trx, 'regions', regionId, organizationId, set, regionReturnColumns);
}

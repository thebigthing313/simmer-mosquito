/**
 * One Region, with the folder it sits in.
 *
 * For a surface that draws its own pending state — the map focus card, which
 * appears next to a map that is already drawn.
 */

import { eq } from '@tanstack/react-db';
import { region_folders } from '../../lib/collections/region_folders';
import { regions } from '../../lib/collections/regions';
import type { Region } from './region-view';
import { joinedOrNull, useRecordById } from './shared';

export function useRegion(regionId: string | null): {
	readonly region: Region | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useRecordById({
		collection: regions(),
		id: regionId,
		query: (query) =>
			query
				// `left`: a Region need not sit in a folder, and an `inner` join would
				// make a top-level one disappear from its own card.
				.join(
					{ folder: region_folders() },
					({ record: region, folder }) => eq(region.region_folder_id, folder.id),
					'left',
				)
				.select(({ record: region, folder }) => ({
					id: region.id,
					name: region.name,
					description: region.description,
					folderId: region.region_folder_id,
					folderName: joinedOrNull(folder.name),
					latitude: region.lat,
					longitude: region.lng,
					geometryKind: region.geom_type,
					metadata: region.metadata,
					createdAt: region.created_at,
					updatedAt: region.updated_at,
					createdByProfileId: region.created_by_profile_id,
					updatedByProfileId: region.updated_by_profile_id,
				})),
	});

	return { region: result.record, isReady: result.isReady, isError: result.isError };
}

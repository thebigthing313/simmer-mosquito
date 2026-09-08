/**
 * One Region, with the folder it sits in.
 *
 * For a surface that draws its own pending state — the map focus card, which
 * appears next to a map that is already drawn.
 */

import { caseWhen, eq, isNull, useLiveQuery } from '@tanstack/react-db';
import { region_folders } from '../../lib/collections/region_folders';
import { regions } from '../../lib/collections/regions';
import type { Region } from './region-view';
import { mapCardGcTimeMs, unmatchableId } from './shared';

export function useRegion(
	regionId: string | null,
	options?: { readonly gcTime?: number },
): { readonly region: Region | undefined; readonly isReady: boolean } {
	const result = useLiveQuery(
		{
			gcTime: options?.gcTime ?? mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ region: regions() })
					.where(({ region }) => eq(region.id, regionId ?? unmatchableId))
					// `left`: a Region need not sit in a folder, and an `inner` join would
					// make a top-level one disappear from its own card.
					.join(
						{ folder: region_folders() },
						({ region, folder }) => eq(region.region_folder_id, folder.id),
						'left',
					)
					.select(({ region, folder }) => ({
						id: region.id,
						name: region.name,
						description: region.description,
						folderId: region.region_folder_id,
						// Guarded on the Region's own column, so a top-level Region reads as
						// `null` rather than as the `undefined` an unmatched join yields.
						folderName: caseWhen(isNull(region.region_folder_id), null, folder.name),
						latitude: region.lat,
						longitude: region.lng,
						geometryKind: region.geom_type,
						metadata: region.metadata,
						createdAt: region.created_at,
						updatedAt: region.updated_at,
						createdByProfileId: region.created_by_profile_id,
						updatedByProfileId: region.updated_by_profile_id,
					})),
		},
		[regionId],
	);

	return { region: result.data[0], isReady: result.isReady };
}

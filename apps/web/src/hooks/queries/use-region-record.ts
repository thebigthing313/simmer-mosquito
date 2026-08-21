/**
 * One Region, as its own edit form reads it.
 *
 * The counterpart of `use-region.ts`, which joins the folder so a card can name
 * it. A form writes the folder's *id*, and the joined hook's `folderName` is a
 * label — right on a card, and not a thing a select can be set to.
 *
 * The boundary is not here and cannot be: a Region's polygon lives outside the
 * sync shape, so the form fetches it over HTTP through `use-region-geometry.ts`
 * and holds it beside these fields.
 *
 * `regions` is on-demand, so this uses the status-gated `useLiveQuery` rather
 * than the suspense variant, which sticks after a navigation unmount over an
 * on-demand collection.
 */

import { eq, useLiveQuery } from '@tanstack/react-db';
import { regions } from '../../lib/collections/regions';
import { mapCardGcTimeMs, unmatchableId } from './shared';

/** A Region as its edit form holds one. */
export interface RegionRecord {
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
	/** `null` when the Region sits at the top level, unfiled. */
	readonly folderId: string | null;
	readonly metadata: unknown;
}

export function useRegionRecord(regionId: string | null | undefined): {
	readonly region: RegionRecord | undefined;
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const id = regionId ?? unmatchableId;

	const result = useLiveQuery(
		{
			gcTime: mapCardGcTimeMs,
			query: (query) =>
				query
					.from({ region: regions })
					.where(({ region }) => eq(region.id, id))
					.select(({ region }) => ({
						id: region.id,
						name: region.name,
						description: region.description,
						folderId: region.region_folder_id,
						metadata: region.metadata,
					})),
		},
		[id],
	);

	return { region: result.data[0], isReady: result.isReady, isError: result.isError };
}

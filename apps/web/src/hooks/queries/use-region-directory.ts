/**
 * Every Region the agency has, by name.
 *
 * The explorer's tree, which groups these under the folders from
 * `useRegionFolders` and searches across both levels at once — so it wants the
 * whole set rather than a page of it, and the search stays in the browser.
 *
 * No org predicate. The shape is scoped to the agency server-side — the proxy
 * forces the scope and ignores anything the caller asks for — so re-stating it
 * here is redundant, and a stale column spelling in a redundant predicate empties
 * a page rather than narrowing it.
 *
 * No boundary. A Region's polygon lives outside the sync shape entirely
 * (`geom` and `geojson` never reach a collection), and the tree draws names, not
 * shapes — the map layer fetches the outlines of the ticked ones by id.
 */

import { useLiveQuery } from '@tanstack/react-db';
import { regions } from '../../lib/collections/regions';
import { activityGcTimeMs } from './shared';

/** A Region as the tree lists one. */
export interface RegionListing {
	readonly id: string;
	readonly name: string;
	/** Searched alongside the name, and shown on the folder rows. */
	readonly description: string | null;
	/** `null` when the Region sits at the top level, unfiled. */
	readonly folderId: string | null;
}

export function useRegionDirectory(): {
	readonly regions: readonly RegionListing[];
	readonly isReady: boolean;
	readonly isError: boolean;
} {
	const result = useLiveQuery(
		{
			gcTime: activityGcTimeMs,
			query: (query) =>
				query
					.from({ region: regions() })
					.orderBy(({ region }) => region.name, 'asc')
					.select(({ region }) => ({
						id: region.id,
						name: region.name,
						description: region.description,
						folderId: region.region_folder_id,
					})),
		},
		[],
	);

	return { regions: result.data, isReady: result.isReady, isError: result.isError };
}

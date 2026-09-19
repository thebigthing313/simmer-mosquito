/**
 * The region tree's two pure halves: folding the flat region list under its
 * folders, and narrowing the folded tree by a search term. They take the
 * listings the two query hooks hand back and touch no state.
 *
 * `groupByFolder` is not the overviews' `groupRows`: this one splits by a
 * nullable column into a map and a root list, because the tree draws the
 * unfiled regions as a group of their own.
 */

import type { RegionListing } from '../../../hooks/queries/use-region-directory';
import type { RegionFolderListing } from '../../../hooks/queries/use-region-folders';

/** The regions under each folder, and the ones filed nowhere. */
export interface RegionsByFolder {
	readonly byFolder: ReadonlyMap<string, readonly RegionListing[]>;
	readonly root: readonly RegionListing[];
}

/** One folder and whichever of its regions the search kept. */
export interface FolderMatch {
	readonly folder: RegionFolderListing;
	readonly regions: readonly RegionListing[];
}

/** The tree as the panel draws it: the folders in order, then the unfiled. */
export interface RegionTree {
	readonly folders: readonly FolderMatch[];
	readonly unfiled: readonly RegionListing[];
}

/**
 * Split the regions by folder, keeping each bucket in the order the rows
 * arrived. A folder nothing is filed under has no entry.
 */
export function groupByFolder(regions: readonly RegionListing[]): RegionsByFolder {
	const byFolder = new Map<string, RegionListing[]>();
	const root: RegionListing[] = [];
	for (const region of regions) {
		if (region.folderId === null) {
			root.push(region);
			continue;
		}
		const bucket = byFolder.get(region.folderId);
		if (bucket === undefined) {
			byFolder.set(region.folderId, [region]);
		} else {
			bucket.push(region);
		}
	}
	return { byFolder, root };
}

/**
 * The tree, narrowed by the search term. A folder hit keeps all of its
 * regions; a region hit keeps just that region under its folder; folders left
 * with nothing drop out. A folder matches on its name or description, a region
 * on its name alone. `query` arrives trimmed and lowercased.
 */
export function searchTree(
	sortedFolders: readonly RegionFolderListing[],
	grouped: RegionsByFolder,
	query: string,
): RegionTree {
	if (query.length === 0) {
		return {
			folders: sortedFolders.map((folder) => ({
				folder,
				regions: grouped.byFolder.get(folder.id) ?? [],
			})),
			unfiled: grouped.root,
		};
	}
	const hit = (value: string | null): boolean => value?.toLowerCase().includes(query) === true;
	const matched: FolderMatch[] = [];
	for (const folder of sortedFolders) {
		const folderRegions = grouped.byFolder.get(folder.id) ?? [];
		const folderHit = hit(folder.name) || hit(folder.description);
		const kept = folderHit ? folderRegions : folderRegions.filter((region) => hit(region.name));
		if (folderHit || kept.length > 0) {
			matched.push({ folder, regions: kept });
		}
	}
	return { folders: matched, unfiled: grouped.root.filter((region) => hit(region.name)) };
}

/**
 * The folders an agency files its regions under.
 *
 * `region_folders` is eager — the tree cannot draw a partial folder list, which
 * is why the collection loads whole — so this is a plain read with no subset
 * behind it. Every surface that shows the tree or offers a folder to file into
 * reads this one: the explorer, the region form's select, and the import page.
 *
 * Unordered here. The explorer sorts by `localeCompare`, which the query
 * pipeline's `orderBy` cannot reproduce, and the form's select sorts its own
 * options.
 */

import { useLiveQuery } from '@tanstack/react-db';
import { region_folders } from '../../lib/collections/region_folders';

/** A region folder, as the tree and the pickers read one. */
export interface RegionFolderListing {
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
}

export function useRegionFolders(): {
	readonly folders: readonly RegionFolderListing[];
	readonly isReady: boolean;
} {
	const result = useLiveQuery(
		(query) =>
			query.from({ folder: region_folders() }).select(({ folder }) => ({
				id: folder.id,
				name: folder.name,
				description: folder.description,
			})),
		[],
	);

	return { folders: result.data, isReady: result.isReady };
}

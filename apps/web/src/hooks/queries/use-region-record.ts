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
 */

import { regions } from '../../lib/collections/regions';
import { useRecordById } from './shared';

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
	const result = useRecordById({
		collection: regions(),
		id: regionId ?? null,
		query: (query) =>
			query.select(({ record: region }) => ({
				id: region.id,
				name: region.name,
				description: region.description,
				folderId: region.region_folder_id,
				metadata: region.metadata,
			})),
	});

	return { region: result.record, isReady: result.isReady, isError: result.isError };
}

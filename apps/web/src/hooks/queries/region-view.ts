/**
 * What a Region looks like above the query layer.
 *
 * Not a hook, so not a `use-` file.
 *
 * A Region's *shape* is not here. The polygon lives outside the sync shape —
 * `geom` and `geojson` never reach a collection — so the surfaces that draw one
 * fetch it over HTTP through `use-region-geometry.ts`. What this carries is the
 * centroid the trigger maintains, which is enough to place a region but not to
 * outline it.
 */

export interface Region {
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
	readonly folderId: string | null;
	/**
	 * What the folder is called — `null` when the Region sits at the top level,
	 * which every surface distinguishes from a folder it could not resolve.
	 */
	readonly folderName: string | null;
	readonly latitude: number;
	readonly longitude: number;
	readonly geometryKind: string;
	readonly metadata: unknown;
	readonly createdAt: Date;
	readonly updatedAt: Date;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
}

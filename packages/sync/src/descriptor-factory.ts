import type { SyncDescriptor } from './index.js';

// Centroid columns (lat, lng, geomType) are trigger-maintained real columns and
// may sync. Raw/heavy geometry (geom binary, geojson) stays server-only and is
// served by the /map/* endpoints — never streamed through an Electric shape.
const serverOnlyGeometryColumns = new Set(['geom', 'geojson']);

export type ServerOnlyGeometryColumn = 'geom' | 'geojson';
export type NoGeometryColumns<TColumns extends readonly string[]> =
	Extract<TColumns[number], ServerOnlyGeometryColumn> extends never ? TColumns : never;

/**
 * The tenant scope the server forces on this shape. It lives here, beside the
 * columns, because both are sync *authorization* facts: the columns say what a
 * client may see of a row, the scope says which rows exist for it at all. The
 * server derives the `where` from this — a shape route cannot choose its own.
 *
 * The `-no-soft-delete` variants are not a policy choice about showing deleted
 * rows. They are for tables that have no `deleted_at` column (`memberships`,
 * `weather_summaries`), where the usual predicate would be a shape error.
 */
export type SyncShapeScope =
	/** `organization_id = $1 and deleted_at is null` — the default. */
	| 'organization'
	/** `organization_id = $1` — table has no `deleted_at`. */
	| 'organization-no-soft-delete'
	/** Org rows plus the platform-owned globals (`organization_id is null`). */
	| 'organization-or-global'
	/** Org-or-global on a table with no `deleted_at`. */
	| 'organization-or-global-no-soft-delete'
	/** `id = $1` — the agency's own `organizations` row. */
	| 'organization-row'
	/** No `where` at all: global reference data every agency reads. */
	| 'global';

export function createSyncDescriptor<
	TRow extends { readonly id: string },
	TColumns extends readonly (keyof TRow & string)[] = readonly (keyof TRow & string)[],
>(input: {
	readonly id: string;
	readonly table: string;
	readonly endpointPath: string;
	readonly syncMode: SyncDescriptor<TRow>['syncMode'];
	readonly scope?: SyncShapeScope;
	readonly columns: TColumns & NoGeometryColumns<TColumns>;
	readonly getKey: (row: TRow) => string;
}): SyncDescriptor<TRow> {
	if (!input.endpointPath.startsWith('/sync/shapes/')) {
		throw new Error(`Descriptor ${input.id} endpointPath must start with /sync/shapes/.`);
	}

	for (const column of input.columns) {
		if (serverOnlyGeometryColumns.has(column)) {
			throw new Error(
				`Descriptor ${input.id} must not include server-only geometry column ${column}.`,
			);
		}
	}

	return { ...input, scope: input.scope ?? 'organization' };
}

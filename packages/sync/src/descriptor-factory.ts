import type { SyncDescriptor } from './index.js';

// Centroid columns (lat, lng, geomType) are trigger-maintained real columns and
// may sync. Raw/heavy geometry (geom binary, geojson) stays server-only and is
// served by the /map/* endpoints — never streamed through an Electric shape.
const serverOnlyGeometryColumns = new Set(['geom', 'geojson']);

export type ServerOnlyGeometryColumn = 'geom' | 'geojson';
export type NoGeometryColumns<TColumns extends readonly string[]> =
	Extract<TColumns[number], ServerOnlyGeometryColumn> extends never ? TColumns : never;

export function createSyncDescriptor<
	TRow extends { readonly id: string },
	TColumns extends readonly (keyof TRow & string)[] = readonly (keyof TRow & string)[],
>(input: {
	readonly id: string;
	readonly table: string;
	readonly endpointPath: string;
	readonly syncMode: SyncDescriptor<TRow>['syncMode'];
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

	return input;
}

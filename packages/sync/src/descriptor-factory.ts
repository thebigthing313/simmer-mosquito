import type { SyncDescriptor } from './index.js';

const geometryProjectionColumns = new Set(['lat', 'lng', 'geojson', 'geomType']);

type GeometryProjectionColumn = 'lat' | 'lng' | 'geojson' | 'geomType';
type NoGeometryColumns<TColumns extends readonly string[]> =
	Extract<TColumns[number], GeometryProjectionColumn> extends never ? TColumns : never;

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
		if (geometryProjectionColumns.has(column)) {
			throw new Error(
				`Descriptor ${input.id} must not include projected geometry column ${column}.`,
			);
		}
	}

	return input;
}

import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../auth';
import { toDrawGeometry } from '../components/map/geometry-control';
import type { DrawGeometry } from '../components/map/use-map-draw';

/**
 * Owned geometry is deliberately excluded from the Electric sync shapes — the
 * streamed rows carry only the `lat`/`lng`/`geomType` centroid (ADR 0009), which
 * is enough to plot a marker but cannot rebuild a line or polygon. Edit forms
 * therefore read the full shape from the record's display endpoint.
 */
export interface OwnedGeometrySource {
	/** The `/map/<segment>/:id` path segment, e.g. `source-reduction`. */
	readonly segment: string;
	/** The key the endpoint nests its row under, e.g. `sourceReduction`. */
	readonly bodyKey: string;
}

export const CHEMICAL_GEOMETRY_SOURCE: OwnedGeometrySource = {
	segment: 'chemical',
	bodyKey: 'application',
};
export const SOURCE_REDUCTION_GEOMETRY_SOURCE: OwnedGeometrySource = {
	segment: 'source-reduction',
	bodyKey: 'sourceReduction',
};
export const BIOCONTROL_GEOMETRY_SOURCE: OwnedGeometrySource = {
	segment: 'biocontrol',
	bodyKey: 'biocontrolAction',
};
export const OUTREACH_GEOMETRY_SOURCE: OwnedGeometrySource = {
	segment: 'outreach',
	bodyKey: 'outreachAction',
};
export const REQUESTED_CONTROL_ACTION_GEOMETRY_SOURCE: OwnedGeometrySource = {
	segment: 'requested-control-actions',
	bodyKey: 'requestedControlAction',
};

export interface OwnedGeometryQuery {
	/**
	 * The raw stored geometry, for display. Includes multi-geometries, which a
	 * detail page can render even though the draw flow cannot edit them.
	 */
	readonly geojson: GeoJsonGeometry | null;
	/** The stored PostGIS type (`st_polygon`), for labelling. */
	readonly geomType: string | null;
	/**
	 * The same geometry narrowed to what the draw flow can edit — null for the
	 * multi-geometries `toDrawGeometry` rejects. Edit forms use this.
	 */
	readonly geometry: DrawGeometry | null;
	readonly isPending: boolean;
	readonly isError: boolean;
}

interface OwnedGeometryPayload {
	readonly geojson: GeoJsonGeometry | null;
	readonly geomType: string | null;
}

/**
 * Fetch a record's full owned geometry for an edit form.
 *
 * `updatedAt` is part of the cache key so re-opening the form after a save loads
 * the geometry that was just written rather than a stale cached copy.
 *
 * That key moves under the form's own feet: saving writes `updatedAt`
 * optimistically, so a form mid-save asks for a key it has never fetched. Holding
 * the previous geometry keeps `isPending` false across that switch, so the caller
 * does not swap the form out for a skeleton and unmount it — which on a failed
 * save discarded the error message the submit handler had just set. The refetch
 * still happens; only the blanking is suppressed.
 */
export function useOwnedGeometry(
	source: OwnedGeometrySource,
	id: string,
	updatedAt: string,
): OwnedGeometryQuery {
	const query = useQuery({
		queryKey: ['owned-geometry', source.segment, id, updatedAt],
		queryFn: ({ signal }) => fetchOwnedGeometry(source, id, signal),
		placeholderData: (previous) => previous,
		staleTime: Number.POSITIVE_INFINITY,
	});

	const geojson = query.data?.geojson ?? null;
	return {
		geojson,
		geomType: query.data?.geomType ?? null,
		geometry: toDrawGeometry(geojson),
		isPending: query.isPending,
		isError: query.isError,
	};
}

async function fetchOwnedGeometry(
	source: OwnedGeometrySource,
	id: string,
	signal: AbortSignal,
): Promise<OwnedGeometryPayload> {
	const url = new URL(`/map/${source.segment}/${id}`, getServerUrl());
	const response = await fetch(url, { credentials: 'include', signal });
	if (response.status === 404) {
		return { geojson: null, geomType: null };
	}
	if (!response.ok) {
		throw new Error(`Geometry request failed with ${response.status}`);
	}

	const body = (await response.json()) as Record<
		string,
		{ readonly geojson?: unknown; readonly geomType?: unknown } | undefined
	>;
	const row = body[source.bodyKey];
	return {
		geojson: (row?.geojson ?? null) as GeoJsonGeometry | null,
		geomType: typeof row?.geomType === 'string' ? row.geomType : null,
	};
}

import { centroidFromGeoJson, type GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { type QueryClient, useQuery } from '@tanstack/react-query';
import { getServerUrl } from '../auth';

export interface RegionGeometry {
	readonly geojson: GeoJsonGeometry | null;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly geomType: string | null;
}

// Region polygons are deliberately excluded from the Electric sync shape (the
// synced row has no geometry), so the boundary is read over HTTP — mirroring the
// habitat detail's geometry query. Keyed on the id alone so an unrelated field
// edit doesn't refetch, and a geometry edit can seed this exact key.
export function regionGeometryQueryKey(regionId: string): readonly unknown[] {
	return ['region-geometry', regionId];
}

export function useRegionGeometry(regionId: string) {
	return useQuery({
		queryKey: regionGeometryQueryKey(regionId),
		queryFn: ({ signal }) => fetchRegionGeometry(regionId, signal),
		staleTime: Number.POSITIVE_INFINITY,
		placeholderData: (previous) => previous,
	});
}

/**
 * Read one region's boundary imperatively, sharing the hook's cache entry. The
 * forms' "use a region as this polygon" convenience fetches on click rather than
 * on render, so it can't go through the hook.
 */
export function fetchRegionGeometryOnce(
	queryClient: QueryClient,
	regionId: string,
): Promise<RegionGeometry | null> {
	return queryClient.fetchQuery({
		queryKey: regionGeometryQueryKey(regionId),
		queryFn: ({ signal }) => fetchRegionGeometry(regionId, signal),
		staleTime: Number.POSITIVE_INFINITY,
	});
}

/**
 * Prime the geometry cache so navigating to a region's detail right after a
 * create/edit shows the saved boundary instantly, then invalidate so it still
 * revalidates against the server without an empty-state flash.
 */
export function seedRegionGeometryCache(
	queryClient: QueryClient,
	regionId: string,
	geojson: GeoJsonGeometry,
): void {
	const centroid = centroidFromGeoJson(geojson);
	const value: RegionGeometry = {
		geojson,
		lat: centroid?.lat ?? null,
		lng: centroid?.lng ?? null,
		geomType: geojson.type,
	};
	queryClient.setQueryData(regionGeometryQueryKey(regionId), value);
	void queryClient.invalidateQueries({ queryKey: regionGeometryQueryKey(regionId) });
}

async function fetchRegionGeometry(
	regionId: string,
	signal: AbortSignal,
): Promise<RegionGeometry | null> {
	const response = await fetch(new URL(`/map/regions/${regionId}`, getServerUrl()), {
		credentials: 'include',
		signal,
	});
	if (response.status === 404) {
		return null;
	}
	if (!response.ok) {
		throw new Error(`Region geometry request failed with ${response.status}`);
	}

	const body = (await response.json()) as {
		readonly region?: {
			readonly geojson?: unknown;
			readonly lat?: number;
			readonly lng?: number;
			readonly geomType?: string;
		};
	};
	const region = body.region;
	if (region === undefined) {
		return null;
	}

	return {
		geojson: (region.geojson ?? null) as GeoJsonGeometry | null,
		lat: region.lat ?? null,
		lng: region.lng ?? null,
		geomType: region.geomType ?? null,
	};
}

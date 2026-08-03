import {
	type GeoJsonGeometry,
	geometryContainsLngLat,
	type LngLat,
} from '@simmer-mosquito/mapping';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchRegionGeometry, regionGeometryQueryKey } from '../../hooks/use-region-geometry';

export interface RegionMembership {
	/**
	 * Whether a record at this point belongs to the selected regions. Always true
	 * when no region is selected — an empty selection narrows nothing.
	 */
	readonly contains: (point: LngLat) => boolean;
	/**
	 * False while the selected boundaries are still being read. Callers show their
	 * loading state rather than an empty list, which would read as "no results".
	 */
	readonly isReady: boolean;
}

const NO_REGIONS: RegionMembership = { contains: () => true, isReady: true };

/**
 * Region membership for explorers that filter their list in the browser.
 *
 * Most map surfaces narrow by region server-side, where PostGIS answers it, but
 * the address book and the service-request list are built from rows already
 * synced to the client. Both hold point records, so the same question is
 * answerable here from the region boundaries alone — read over HTTP, since the
 * region sync shape deliberately carries no geometry.
 *
 * Boundaries are cached per region and never go stale on their own, so ticking a
 * region off and back on costs nothing.
 */
export function useRegionMembership(regionIds: ReadonlySet<string>): RegionMembership {
	// Keyed on the ids themselves, not the set's identity, so a re-render with an
	// equal-but-new Set doesn't restart the boundary reads.
	const key = [...regionIds].sort().join(',');
	const ids = useMemo(() => (key.length === 0 ? [] : key.split(',')), [key]);

	const results = useQueries({
		queries: ids.map((id) => ({
			queryKey: regionGeometryQueryKey(id),
			queryFn: ({ signal }: { readonly signal: AbortSignal }) => fetchRegionGeometry(id, signal),
			staleTime: Number.POSITIVE_INFINITY,
		})),
	});

	// A status-per-region signature changes exactly when the loaded set does, so
	// the boundary list — and the predicate built from it — stays referentially
	// stable across the renders in between. An unstable predicate would rebuild
	// every caller's filtered list, and with it the map's whole feature source.
	const readiness = results.map((result) => result.status).join(',');
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the id set + each read's state.
	const boundaries = useMemo(
		() =>
			results
				.map((result) => result.data?.geojson)
				.filter((geometry): geometry is GeoJsonGeometry => geometry != null),
		[key, readiness],
	);
	const isReady = results.every((result) => !result.isPending);

	return useMemo(() => {
		if (ids.length === 0) {
			return NO_REGIONS;
		}
		return {
			contains: (point: LngLat) =>
				Number.isFinite(point.lng) &&
				Number.isFinite(point.lat) &&
				boundaries.some((boundary) => geometryContainsLngLat(boundary, point)),
			isReady,
		};
	}, [ids.length, boundaries, isReady]);
}

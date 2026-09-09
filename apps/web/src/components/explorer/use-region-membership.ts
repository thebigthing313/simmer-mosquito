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

	// The boundary list has to stay referentially stable across the renders
	// between two loads: an unstable predicate rebuilds every caller's filtered
	// list, and with it the map's whole feature source. A `useMemo` could not say
	// that honestly, because what it reads is the results array, whose identity
	// changes every render, so it named a status signature in its dependency list
	// instead and carried a `biome-ignore` to allow the mismatch. That is a memo
	// inference cannot reproduce, which is exactly what the React Compiler refused
	// to compile (`PreserveManualMemo`, #822).
	//
	// `combine` is the library's own answer to it. `useQueries` runs the result
	// through `replaceEqualDeep`, which returns the previous object when the new
	// one is equal, and every element is a reference check rather than a deep walk
	// of the polygon, so the cost is one comparison per selected region. Same
	// stability, stated by the call rather than worked around beside it.
	const { boundaries, isReady } = useQueries({
		queries: ids.map((id) => ({
			queryKey: regionGeometryQueryKey(id),
			queryFn: ({ signal }: { readonly signal: AbortSignal }) => fetchRegionGeometry(id, signal),
			staleTime: Number.POSITIVE_INFINITY,
		})),
		combine: (results) => ({
			boundaries: results
				.map((result) => result.data?.geojson)
				.filter((geometry): geometry is GeoJsonGeometry => geometry != null),
			isReady: results.every((result) => !result.isPending),
		}),
	});

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

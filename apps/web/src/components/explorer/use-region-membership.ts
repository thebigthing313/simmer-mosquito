import {
	type GeoJsonGeometry,
	geometryContainsLngLat,
	type LngLat,
} from '@simmer-mosquito/mapping';
import { useQueries } from '@tanstack/react-query';
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
	const ids = key.length === 0 ? [] : key.split(',');

	// The boundary list has to stay referentially stable across the renders
	// between two loads: an unstable predicate rebuilds every caller's filtered
	// list, and with it the map's whole feature source. `combine` is what states
	// that. `useQueries` runs the result through `replaceEqualDeep`, which returns
	// the previous object when the new one is equal, and every element is a
	// reference check rather than a deep walk of the polygon, so the cost is one
	// comparison per selected region (#822).
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

	return membership(ids.length, boundaries, isReady);
}

/** The predicate the selected boundaries answer, or the open one when none are. */
function membership(
	selectedCount: number,
	boundaries: readonly GeoJsonGeometry[],
	isReady: boolean,
): RegionMembership {
	if (selectedCount === 0) {
		return NO_REGIONS;
	}
	return {
		contains: (point: LngLat) =>
			Number.isFinite(point.lng) &&
			Number.isFinite(point.lat) &&
			boundaries.some((boundary) => geometryContainsLngLat(boundary, point)),
		isReady,
	};
}

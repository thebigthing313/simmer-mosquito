import { centroidFromGeoJson, type GeoJsonGeometry } from '@simmer-mosquito/mapping';
import type { QueryClient } from '@tanstack/react-query';
import { getServerUrl } from '../auth';

/**
 * The habitat geometry query: its key, its fetcher, and the cache seed the
 * create/edit flows call after a save.
 *
 * This lives apart from `-habitat-detail` on purpose. `seedHabitatGeometryCache`
 * is a handful of lines, but the habitat create and edit routes import it from
 * module scope — and a module import is all-or-nothing. While it sat inside the
 * 1600-line detail module it dragged that module's whole dependency graph into
 * the eager route graph with it, including the only `recharts` import in the
 * app. That put ~315 KB of charting library in the boot payload to support a
 * pie chart on one detail page.
 *
 * The rule this encodes: a small utility that eager code imports must not share
 * a module with a heavy component, however related they read.
 */

export interface HabitatGeometry {
	readonly geojson: GeoJsonGeometry | null;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly geomType: string | null;
}

/**
 * Keyed on habitatId alone (not updatedAt): an unrelated field edit shouldn't
 * refetch geometry, and a geometry edit seeds this exact key via
 * {@link seedHabitatGeometryCache}, so the detail renders the new shape
 * immediately instead of flashing "No geometry recorded" while a freshly-keyed
 * query loads.
 */
export function habitatGeometryQueryKey(habitatId: string): readonly unknown[] {
	return ['habitat-geometry', habitatId];
}

/**
 * Prime the geometry cache so navigating to a habitat's detail right after a
 * create/edit shows the saved geometry instantly. Then invalidate so the detail
 * still revalidates against the server on mount — the cached value stays visible
 * during that refetch, so there's no empty-state flash.
 */
export function seedHabitatGeometryCache(
	queryClient: QueryClient,
	habitatId: string,
	geojson: GeoJsonGeometry,
): void {
	const centroid = centroidFromGeoJson(geojson);
	const value: HabitatGeometry = {
		geojson,
		lat: centroid?.lat ?? null,
		lng: centroid?.lng ?? null,
		geomType: geojson.type,
	};
	queryClient.setQueryData(habitatGeometryQueryKey(habitatId), value);
	void queryClient.invalidateQueries({ queryKey: habitatGeometryQueryKey(habitatId) });
}

export async function fetchHabitatGeometry(
	habitatId: string,
	signal: AbortSignal,
): Promise<HabitatGeometry | null> {
	const url = new URL(`/map/habitats/${habitatId}`, getServerUrl());
	const response = await fetch(url, { credentials: 'include', signal });
	if (response.status === 404) {
		return null;
	}
	if (!response.ok) {
		throw new Error(`Habitat geometry request failed with ${response.status}`);
	}

	const body = (await response.json()) as {
		readonly habitat?: {
			readonly geojson?: unknown;
			readonly lat?: number;
			readonly lng?: number;
			readonly geomType?: string;
		};
	};
	const habitat = body.habitat;
	if (habitat === undefined) {
		return null;
	}

	return {
		geojson: (habitat.geojson ?? null) as GeoJsonGeometry | null,
		lat: habitat.lat ?? null,
		lng: habitat.lng ?? null,
		geomType: habitat.geomType ?? null,
	};
}

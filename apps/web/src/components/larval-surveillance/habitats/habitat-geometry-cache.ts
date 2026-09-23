import { centroidFromGeoJson, type GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { sessionFetch } from '@simmer-mosquito/sync';
import type { QueryClient } from '@tanstack/react-query';
import { getServerUrl } from '../../../auth';
import { checkOwnedGeometry } from '../../map/geojson-adapter';

/**
 * The habitat geometry query: its key, its fetcher, and the cache seed the
 * create/edit flows call after a save. Apart from `habitat-detail` because the
 * create and edit routes import `seedHabitatGeometryCache` from module scope,
 * and a module import drags the whole detail module into the eager route
 * graph, `recharts` included.
 */

export interface HabitatGeometry {
	readonly geojson: GeoJsonGeometry | null;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly geomType: string | null;
	/**
	 * Set when the column held a shape a Habitat may not store, for the detail's
	 * Location card to print. Resolved once per fetch.
	 */
	readonly unsupportedShape: string | null;
}

/**
 * Keyed on habitatId alone: an unrelated field edit does not refetch geometry,
 * and a geometry edit seeds this exact key via {@link seedHabitatGeometryCache}.
 */
export function habitatGeometryQueryKey(habitatId: string): readonly unknown[] {
	return ['habitat-geometry', habitatId];
}

/**
 * Prime the geometry cache so the detail shows the saved geometry at once after
 * a create or edit, then invalidate so it still revalidates on mount.
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
		unsupportedShape: null,
	};
	queryClient.setQueryData(habitatGeometryQueryKey(habitatId), value);
	void queryClient.invalidateQueries({ queryKey: habitatGeometryQueryKey(habitatId) });
}

export async function fetchHabitatGeometry(
	habitatId: string,
	signal: AbortSignal,
): Promise<HabitatGeometry | null> {
	const url = new URL(`/map/habitats/${habitatId}`, getServerUrl());
	const response = await sessionFetch(url, { signal });
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

	const checked = checkOwnedGeometry('habitat', habitat.geojson);
	return {
		geojson: checked.geometry,
		lat: habitat.lat ?? null,
		lng: habitat.lng ?? null,
		geomType: habitat.geomType ?? null,
		unsupportedShape: checked.unsupportedShape,
	};
}

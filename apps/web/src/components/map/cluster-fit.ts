import { MAP_CLUSTER_UNTIL_ZOOM } from '@simmer-mosquito/mapping';
import type { Map as MapboxMap } from 'mapbox-gl';

/** The box a cluster's points cover, in WGS84. */
export interface ClusterBounds {
	readonly west: number;
	readonly south: number;
	readonly east: number;
	readonly north: number;
}

/**
 * The box a clicked feature's points cover, or null when it is no cluster.
 *
 * A clustered tile writes `cluster: true` and the four edges of its points' box
 * on a cluster and none of them on a record. A cluster missing an edge is
 * answered with null too, which leaves the click doing nothing rather than
 * flying the camera to a box with a side at zero.
 */
export function clusterBounds(
	properties: Readonly<Record<string, unknown>> | null | undefined,
): ClusterBounds | null {
	if (properties?.cluster !== true) {
		return null;
	}
	const { cluster_west, cluster_south, cluster_east, cluster_north } = properties;
	if (
		typeof cluster_west !== 'number' ||
		typeof cluster_south !== 'number' ||
		typeof cluster_east !== 'number' ||
		typeof cluster_north !== 'number'
	) {
		return null;
	}
	return { west: cluster_west, south: cluster_south, east: cluster_east, north: cluster_north };
}

/**
 * Zoom the map in to the records under a cluster.
 *
 * Never past the zoom the tiles stop clustering at, since that is where every
 * record under the cluster is drawn as itself. A box with no size, every point
 * on one spot, has nothing to fit, so the map centres on it at that zoom, and
 * points sharing exact coordinates stay stacked there the way they do on a
 * plain tile.
 */
export function fitMapToCluster(map: MapboxMap, bounds: ClusterBounds): void {
	if (bounds.west === bounds.east && bounds.south === bounds.north) {
		map.easeTo({ center: [bounds.west, bounds.south], zoom: MAP_CLUSTER_UNTIL_ZOOM });
		return;
	}
	map.fitBounds(
		[
			[bounds.west, bounds.south],
			[bounds.east, bounds.north],
		],
		{ padding: 48, maxZoom: MAP_CLUSTER_UNTIL_ZOOM },
	);
}

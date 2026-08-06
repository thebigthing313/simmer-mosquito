/**
 * What route planning needs to know about a stop, whatever the stop is.
 *
 * A route is an ordered run field crews follow, and the two record types it can
 * order — habitats and traps — carry different detail. Only these fields reach
 * the map and the planning pages; each domain's stop view adds its own on top
 * and satisfies this structurally.
 */
export interface RouteStop {
	readonly routeItemId: string;
	/** The stop's place in the run, as shown on the map pin and in the list. */
	readonly ordinal: number;
	readonly name: string;
	readonly lat: number | null;
	readonly lng: number | null;
	readonly isActive: boolean;
	readonly directionsToNextItem: string | null;
}

/**
 * The bounding box of every stop that has resolved to a point, or null when
 * none has — which callers read as "leave the camera where it is" rather than
 * framing an empty world.
 */
export function boundsOfStops(
	stops: readonly RouteStop[],
): [[number, number], [number, number]] | null {
	let west = Number.POSITIVE_INFINITY;
	let south = Number.POSITIVE_INFINITY;
	let east = Number.NEGATIVE_INFINITY;
	let north = Number.NEGATIVE_INFINITY;
	let count = 0;

	for (const stop of stops) {
		if (stop.lat === null || stop.lng === null) {
			continue;
		}
		west = Math.min(west, stop.lng);
		south = Math.min(south, stop.lat);
		east = Math.max(east, stop.lng);
		north = Math.max(north, stop.lat);
		count += 1;
	}

	return count === 0
		? null
		: [
				[west, south],
				[east, north],
			];
}

/** `1 stop` / `n stops`. */
export function stopCountLabel(count: number): string {
	return count === 1 ? '1 stop' : `${count} stops`;
}

/** `1 route` / `n routes`. */
export function routeCountLabel(count: number): string {
	return count === 1 ? '1 route' : `${count} routes`;
}

import type { Map as MapboxMap } from 'mapbox-gl';
import type { MapCamera } from '../components/map/map-styles';

/**
 * The one camera every explorer map opens on, kept in this browser.
 *
 * Keyed by Organization, because a person who works in two Organizations
 * works in two places, and the camera one left behind is no use in the other.
 * Browser storage and nothing else: a camera is a convenience for the person
 * at this screen, not a record anybody else reads. Every read and write is
 * guarded, since a private window or a blocked site throws on access, and the
 * explorer then opens where it would have with nothing stored.
 */
const STORAGE_PREFIX = 'simmer.explorer-camera.';

export function explorerCameraKey(organizationId: string): string {
	return `${STORAGE_PREFIX}${organizationId}`;
}

/** The stored camera, or `undefined` for none, a blocked store or a value that is not one. */
export function readExplorerCamera(key: string): MapCamera | undefined {
	try {
		const raw = globalThis.localStorage?.getItem(key);
		return raw === null || raw === undefined ? undefined : parseCamera(JSON.parse(raw));
	} catch {
		return undefined;
	}
}

export function writeExplorerCamera(key: string, camera: MapCamera): void {
	try {
		globalThis.localStorage?.setItem(key, JSON.stringify(camera));
	} catch {
		// The camera lives only as long as this map, which is where it was before.
	}
}

/**
 * Store the camera every time it comes to rest, until the returned function
 * takes the listener back off. `moveend` is the one event: a zoom, a rotate and
 * a pitch all end in one.
 */
export function watchExplorerCamera(map: MapboxMap, key: string): () => void {
	const store = () => {
		const center = map.getCenter();
		writeExplorerCamera(key, {
			center: [center.lng, center.lat],
			zoom: map.getZoom(),
			bearing: map.getBearing(),
			pitch: map.getPitch(),
		});
	};
	map.on('moveend', store);
	return () => {
		map.off('moveend', store);
	};
}

/**
 * A stored value as a camera, or `undefined`. It is input: a value written by
 * an older build or edited by hand must not put the map somewhere it cannot
 * draw.
 */
function parseCamera(value: unknown): MapCamera | undefined {
	if (typeof value !== 'object' || value === null) {
		return undefined;
	}
	const { center, zoom, bearing, pitch } = value as Record<string, unknown>;
	if (!Array.isArray(center) || center.length !== 2) {
		return undefined;
	}
	const [lng, lat] = center as unknown[];
	if (
		!isFiniteIn(lng, -180, 180) ||
		!isFiniteIn(lat, -90, 90) ||
		!isFiniteIn(zoom, 0, 24) ||
		!isFiniteIn(bearing, -360, 360) ||
		!isFiniteIn(pitch, 0, 85)
	) {
		return undefined;
	}
	return { center: [lng, lat], zoom, bearing, pitch };
}

function isFiniteIn(value: unknown, min: number, max: number): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}

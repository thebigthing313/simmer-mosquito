import { z } from 'zod';
import type { DrawGeometry } from './use-map-draw';

/**
 * The coordinate a create form can be opened at, carried in the URL.
 *
 * Search params rather than router state on purpose: the prefilled form is then
 * a link — shareable, bookmarkable, and survives a reload — which is what makes
 * "right-click here, record what you found" work the same way from a colleague's
 * message as from the map.
 *
 * `.catch(undefined)` on both: a hand-edited or truncated URL should open an
 * ordinary empty form, never a route error. A half-pair is discarded for the
 * same reason — see {@link pointFromSearch}.
 */
export const mapPointSearchSchema = z.object({
	lat: z.coerce.number().min(-90).max(90).optional().catch(undefined),
	lng: z.coerce.number().min(-180).max(180).optional().catch(undefined),
});

export type MapPointSearch = z.infer<typeof mapPointSearchSchema>;

/**
 * Narrowed to Point deliberately. Several of the forms this seeds are
 * point-only — an address, a trap — and typing the seed as the full
 * {@link DrawGeometry} union would make them reject it.
 */
export type DrawPoint = Extract<DrawGeometry, { readonly type: 'Point' }>;

/**
 * The seed geometry for a form opened from the map, or null for an ordinary one.
 *
 * Only a complete pair produces a point. A lone `lat` is not half a location —
 * it is a broken link, and drawing something from it would put a pin in the
 * Atlantic and let the operator save it.
 */
export function pointFromSearch(search: MapPointSearch): DrawPoint | null {
	const { lat, lng } = search;
	if (lat === undefined || lng === undefined) {
		return null;
	}
	// GeoJSON is [lng, lat]. The pair is stored the other way round in the URL
	// because that is the order operators read and speak coordinates in.
	return { type: 'Point', coordinates: [lng, lat] };
}

/** How a coordinate reads in the UI and on the clipboard: `lat, lng`, six places. */
export function formatLatLng(lat: number, lng: number): string {
	return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/**
 * How a record with no habitat names itself.
 *
 * An ad-hoc inspection or sample has no habitat to title it, and "Ad-hoc
 * inspection" names the category every such row already belongs to — it leaves
 * nothing to tell one row from the next. The coordinates do, so they are the
 * label wherever a habitat name would have gone.
 */

/** `34.05213, -118.24368`, or null when the row carries no centroid yet. */
export function formatCoordinates(
	lat: number | null | undefined,
	lng: number | null | undefined,
): string | null {
	return lat === null || lat === undefined || lng === null || lng === undefined
		? null
		: `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** The coordinates, falling back to the category name when there is no centroid. */
export function adhocLabel(
	lat: number | null | undefined,
	lng: number | null | undefined,
	fallback = 'Ad-hoc inspection',
): string {
	return formatCoordinates(lat, lng) ?? fallback;
}

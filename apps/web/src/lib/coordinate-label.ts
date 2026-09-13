/**
 * How a record's centroid reads on a surface.
 *
 * Two labels sit on one formatter. The first is how a record with no habitat
 * names itself: an ad-hoc inspection or sample has no habitat to title it, and
 * "Ad-hoc inspection" names the category every such row already belongs to, so
 * it leaves nothing to tell one row from the next. The coordinates do, so they
 * are the label wherever a habitat name would have gone. The second is the
 * Coordinates row of a detail page, which is a row that always draws and so
 * needs a word for the absent centroid rather than a blank.
 */

/**
 * `34.05213, -118.24368`, or null when the row carries no centroid yet.
 *
 * Module-private: the two labels below are the whole of what a surface asks
 * for, and a caller formatting the pair itself is a caller with a fallback of
 * its own, which is what this module exists to hold in one place.
 */
function formatCoordinates(
	lat: number | null | undefined,
	lng: number | null | undefined,
): string | null {
	return lat === null || lat === undefined || lng === null || lng === undefined
		? null
		: `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/**
 * The coordinates, or the words for a record that carries none.
 *
 * The three larval detail modules wrote this out for themselves, one against
 * `typeof lat === 'number'` and one against `lat == null`, which are the same
 * test spelled two ways. The fallback is not configurable, because a detail
 * page's Coordinates row says the same thing on every record kind.
 */
export function coordinateLabel(
	lat: number | null | undefined,
	lng: number | null | undefined,
): string {
	return formatCoordinates(lat, lng) ?? 'Unknown coordinates';
}

/** The coordinates, falling back to the category name when there is no centroid. */
export function adhocLabel(
	lat: number | null | undefined,
	lng: number | null | undefined,
	fallback = 'Ad-hoc inspection',
): string {
	return formatCoordinates(lat, lng) ?? fallback;
}

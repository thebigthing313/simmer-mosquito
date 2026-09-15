/**
 * How a record's centroid reads on a surface.
 *
 * Three labels sit on one formatter. The first is how a record with no habitat
 * names itself: an ad-hoc inspection or sample has no habitat to title it, and
 * "Ad-hoc inspection" names the category every such row already belongs to, so
 * it leaves nothing to tell one row from the next. The coordinates do, so they
 * are the label wherever a habitat name would have gone. The second is the
 * Coordinates row of a detail page, which is a row that always draws and so
 * needs a word for the absent centroid rather than a blank. The third is the
 * whole of that first question asked at once, for a surface holding a record
 * that may or may not sit on a habitat.
 */

/**
 * `34.05213, -118.24368`, or null when the row carries no centroid yet.
 *
 * Module-private: the three labels below are the whole of what a surface asks
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
 * test spelled two ways. The fallback is not configurable, because the one
 * caller left says the same thing on every record kind.
 *
 * The inspection and sample detail pages used to draw a Coordinates row of
 * their own and no longer do, because the Location card beside the facts
 * already draws the spot. What is left is the habitat's location line.
 */
export function coordinateLabel(
	lat: number | null | undefined,
	lng: number | null | undefined,
): string {
	return formatCoordinates(lat, lng) ?? 'Unknown coordinates';
}

/**
 * The coordinates, falling back to what the surface calls a record with none.
 *
 * `fallback` is required, which is the whole of #953. The default was
 * `Ad-hoc inspection`, one record kind's category name, and three sample
 * surfaces took it: the samples explorer row, the sample map card and the
 * Awaiting Identification panel on the larval overview each read
 * `Ad-hoc inspection` for a sample with no habitat and no centroid. #918 made
 * `habitatLabel`'s fallback required for that reason one level up, and a
 * required argument makes the next instance a `tsc` error rather than a wrong
 * word on screen.
 */
export function adhocLabel(
	lat: number | null | undefined,
	lng: number | null | undefined,
	fallback: string,
): string {
	return formatCoordinates(lat, lng) ?? fallback;
}

/** What a record carries about the habitat it was recorded at. */
export interface HabitatLabelRow {
	readonly habitatId: string | null;
	readonly habitatName: string | null;
	readonly lat: number | null;
	readonly lng: number | null;
}

/**
 * What to call a record by the habitat it sits on.
 *
 * The inspection detail, the inspection explorer and the sample detail each
 * wrote this out, two of them under the name `site` plus `Label`, and the three
 * disagreed on the arm that runs when there is no habitat: two read the
 * coordinates and the sample's read the bare word `Ad-hoc`. The coordinates
 * win, which is the rule the header above already states (#918). Two more
 * followed in #954, the inspection map card and the larval activity reader.
 *
 * The name is `habitat` and not `site`, because `CONTEXT.md` lists `site` as
 * not a term: it reads as a Habitat to one person and a Trap to the next.
 *
 * `fallback` is required rather than defaulted. The only default available is
 * one record kind's category name, and the sample detail is what a wrong one
 * looks like on screen: it reached `adhocLabel` through an arm of its own, so a
 * sample carrying no centroid read `Ad-hoc inspection`.
 *
 * ## Which arm a seam can reach
 *
 * The id arm runs where `habitatName` is `null` and `habitatId` is not, and
 * every seam can produce that row. The two server map surfaces,
 * `/map/inspections` and `/map/samples`, select `h.habitat_name` unwrapped, so
 * a habitat with no name reaches it. Every client seam under `hooks/queries`
 * projects the name through `joinedHabitatNameSelect` in `habitat-view.ts`,
 * which is `coalesce(habitat_name, concat(lat, ', ', lng))` guarded on the
 * joined row, so there a habitat with no name has already read out its
 * coordinates one layer down and the row that reaches the id arm is a habitat
 * whose row has not streamed: `habitats` syncs on demand, the `left` join is
 * unmatched until it lands, and the guard answers `null` for that. Before #998
 * the guard was on the inspection's own `habitat_id`, which cannot see the
 * difference, so the `concat` ran over absent columns and `habitatName` was
 * the non-empty string `, ` that no arm below it could get past. The seam
 * suites beside `use-inspection-table.test.tsx` hold all three answers per
 * seam.
 *
 * `||` rather than `??` on the name, so a habitat named with whitespace alone
 * falls out of the name arm instead of titling the record with spaces. That is
 * unreachable, and from the write rather than from a read: every path into
 * `habitat_name` is one of the three arms of `habitatTableCommands`, each
 * reading the column through `readNullableText`, which trims and answers `null`
 * on what is left. The habitat merge dispatches `updateHabitatDetails` and is
 * the same arm; the organization seed routes create habitat types and no
 * habitat; there is no habitat importer; the column carries no default and no
 * CHECK, and the seeds write literal names. The trim has been on that path
 * since habitats shipped, so no stored row predates it either.
 *
 * So `||` is inert on every seam, and it stays because a surface asking this
 * question should ask the one function rather than a private variant that
 * omits the arms it happens not to need.
 */
export function habitatLabel(
	row: HabitatLabelRow,
	options: {
		/** What a row with no habitat and no centroid is called. */
		readonly fallback: string;
		/** The address the record was linked to, where the surface carries one. */
		readonly addressName?: string | null;
	},
): string {
	return (
		row.habitatName?.trim() ||
		options.addressName?.trim() ||
		(row.habitatId === null
			? adhocLabel(row.lat, row.lng, options.fallback)
			: `Habitat ${row.habitatId.slice(0, 8)}`)
	);
}

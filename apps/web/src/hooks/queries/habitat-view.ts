/**
 * What a Habitat looks like above the query layer.
 *
 * Not a hook, so not a `use-` file: the hooks in this folder are one per shape,
 * and several of them return this one.
 *
 * ## The name a Habitat has when it has none
 *
 * A Habitat may carry no name — a catch basin is known by where it is, not by
 * what it is called — and every surface showing one had its own fallback. The
 * coordinates are that fallback now, which is already how this app names a record
 * with no habitat behind it (`lib/coordinate-label.ts`, on ad-hoc inspections).
 *
 * It is written as `coalesce(habitat_name, concat(lat, ', ', lng))` inside each
 * query rather than as a function applied to the rows afterwards. That keeps the
 * projection a compiled `select`: it becomes part of the pipeline, so it narrows
 * what is materialized, and a Habitat whose other columns moved produces no change
 * downstream. A `fn.select` would run JavaScript per emitted row and give up both.
 *
 * `coalesce` rather than `caseWhen(isNull(…), …)` — the same expression, but
 * `caseWhen` infers `string | null` because it cannot see that the else branch is
 * the column the condition just tested. A nullable name would put the fallback
 * back at every call site.
 *
 * Blank names cannot reach the column: `readText` on the server turns an empty or
 * whitespace-only name into `null` before it is written, so `coalesce` is the
 * whole rule and there is no `''` case to carry.
 *
 * The one thing it costs is precision. The expression language has no `round`, so
 * an unnamed Habitat reads out its centroid in full — where `formatCoordinates`
 * shows five places. Fixing that means rounding `lat`/`lng` where the trigger
 * writes them, not here.
 */

import type { LinkedAddress } from './address-view';

/**
 * A Habitat, as the surfaces that show one whole want it.
 *
 * Every column, because between them the detail page, the explorer and the map
 * card read every column. The narrower shapes have their own hooks.
 */
export interface Habitat {
	readonly id: string;
	/** Never empty. The coordinates stand in when there is no name. */
	readonly name: string;
	readonly description: string;
	readonly typeId: string | null;
	/**
	 * What the Habitat Type is called, joined rather than looked up.
	 *
	 * `null` when the Habitat has no type — which every surface distinguishes from
	 * a type it could not resolve, so the two read as "Unassigned type" and
	 * "Unknown type" rather than as one shrug. The catalog is eager, so the join
	 * costs no request.
	 */
	readonly typeName: string | null;
	readonly addressId: string | null;
	/** Joined, not looked up — see `address-view.ts` for why it is nested here. */
	readonly address: LinkedAddress;
	readonly isActive: boolean;
	readonly isInaccessible: boolean;
	readonly latitude: number;
	readonly longitude: number;
	readonly geometryKind: string;
	readonly metadata: unknown;
	readonly createdAt: Date;
	readonly updatedAt: Date;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
}

/** Enough to name a Habitat in a list, a label, or a map cluster. */
export interface HabitatName {
	readonly id: string;
	readonly name: string;
}

/**
 * A Habitat as a typeahead offers it.
 *
 * The description rides along because it is the second line of a result row — and
 * for a Habitat with no name it is often the only thing that tells two catch
 * basins apart. The centroid rides along because picking a Habitat is how a form
 * says "the work happened here", so the caller frames the map on it without a
 * second read.
 */
export interface HabitatMatch extends HabitatName {
	readonly description: string;
	readonly latitude: number;
	readonly longitude: number;
}

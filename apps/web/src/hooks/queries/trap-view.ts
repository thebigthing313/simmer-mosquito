/**
 * What a Trap looks like above the query layer.
 *
 * Not a hook, so not a `use-` file: several hooks in this folder return this one.
 *
 * ## Why the name is still two columns
 *
 * A Trap is known by `Code - Name`, dropping the dash when only one is set and
 * falling back to a short id when neither is — {@link trapDisplayName}, which
 * every surface already shares. That last branch is what keeps the rule out of
 * the query: the fallback is a substring of the id, and the expression language
 * has no substring. The same reason `Sample.name` is nullable (`sample-view.ts`).
 *
 * So the two columns ride up as they are and the shared helper composes them.
 * Composing them in a `select` would produce a name that reads `Trap` followed by
 * a full uuid for the traps that have neither, which is worse than the helper.
 */

import { adhocLabel } from '../../lib/coordinate-label';
import type { LinkedAddress } from './address-view';

/**
 * A Trap, as the surfaces that show one whole want it.
 *
 * The detail page, the explorer and the map card between them read every column,
 * so this carries every column. Narrower shapes get their own hooks.
 */
export interface Trap {
	readonly id: string;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly description: string | null;
	readonly methodId: string;
	/**
	 * What the Collection Method is called, joined rather than looked up.
	 *
	 * Never null: a Trap must name a method, so there is no "unassigned" state to
	 * distinguish. `Unknown method` stands in only for the instant before the eager
	 * catalog has streamed — which in practice is never, since a trap surface
	 * cannot render before the shape it lives in has.
	 */
	readonly methodName: string;
	readonly lureId: string | null;
	/**
	 * What the Collection Lure is called — `null` when the Trap runs unbaited,
	 * which every surface distinguishes from a lure it could not resolve. Guard on
	 * `lureId` rather than on this, and fall back to `Unknown lure` when the id is
	 * set but the name is not.
	 */
	readonly lureName: string | null;
	readonly addressId: string | null;
	/** Joined, not looked up — see `address-view.ts` for why it is nested here. */
	readonly address: LinkedAddress;
	readonly isActive: boolean;
	readonly latitude: number;
	readonly longitude: number;
	readonly geometryKind: string;
	readonly createdAt: Date;
	readonly updatedAt: Date;
	readonly createdByProfileId: string | null;
	readonly updatedByProfileId: string | null;
}

/**
 * Enough to name a Trap in a list, a select, or a map card title.
 *
 * The two name columns rather than a resolved string, for the reason the module
 * comment gives. Pass one of these to {@link trapDisplayName}.
 */
export interface TrapName {
	readonly id: string;
	readonly trapName: string | null;
	readonly trapCode: string | null;
}

/**
 * The one trap label used everywhere in the app: `Code - Name`, dropping the dash
 * when only one of the two is set, and falling back to a short id when neither
 * is. Selects, lists, detail headers, map cards and route stops all read the same
 * way, so a trap is recognisable by its code wherever it appears.
 *
 * Here rather than beside the other adult-surveillance display helpers because
 * the query hooks call it too, and a hook reaching into a route folder is the
 * wrong direction. Trap labels are also not an adult-surveillance fact: an
 * assignment stop names one.
 */
export function trapDisplayName(trap: TrapName): string {
	const name = trap.trapName?.trim();
	const code = trap.trapCode?.trim();
	if (name && code) {
		return `${code} - ${name}`;
	}
	return code || name || `Trap ${trap.id.slice(0, 8)}`;
}

/** What a Collection carries about where it was taken. */
export interface CollectionLabelRow {
	/** `null` on a collection recorded away from a Trap, which is what makes it one. */
	readonly trapId: string | null;
	readonly trapName: string | null;
	readonly trapCode: string | null;
	readonly lat: number | null;
	readonly lng: number | null;
}

/**
 * What to call a Collection by the place it came from.
 *
 * `habitatLabel` in `lib/coordinate-label.ts` with a Trap where the Habitat is,
 * and it exists for the reason that one does. Five adult surfaces tested
 * `trapId === null` and returned the words "Ad-hoc collection", which names the
 * category every such row already belongs to and so tells one row from the next
 * about as well as a blank does. The collection carries an Address and a
 * centroid of its own, and both say something (#1231).
 *
 * Four rungs: the Trap's `Code - Name`, then the Address the collection was
 * linked to, then its own coordinates, then the word.
 *
 * The Trap rung is `trapDisplayName`, so a collection whose Trap row has not
 * streamed reads `Trap 4f3c1a2b` rather than falling through to coordinates
 * that name the Trap's spot anyway. That is `habitatLabel`'s id arm, and it is
 * why a surface wanting to draw a "still arriving" state of its own tests
 * `resolvedTrapId` before calling this rather than inside it: only the map card
 * does, and only it carries the column that answers.
 *
 * `fallback` is required for the reason it is required one module over: the only
 * default available is one record kind's category name, and a wrong one is what
 * #953 found on three sample surfaces.
 */
export function collectionLabel(
	row: CollectionLabelRow,
	options: {
		/** What a collection with no Trap, no Address and no centroid is called. */
		readonly fallback: string;
		/** The Address the collection was linked to, where the surface carries one. */
		readonly addressName?: string | null;
	},
): string {
	if (row.trapId !== null) {
		return trapDisplayName({ id: row.trapId, trapName: row.trapName, trapCode: row.trapCode });
	}
	return options.addressName?.trim() || adhocLabel(row.lat, row.lng, options.fallback);
}

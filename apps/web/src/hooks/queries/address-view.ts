/**
 * What an Address looks like above the query layer.
 *
 * Not a hook, so not a `use-` file.
 *
 * ## Why this one is columns rather than a label
 *
 * Every other view in this folder hands back the string a surface will show. An
 * Address does not, because there are four of them — the single comma-run a map
 * card fits, the envelope lines a detail page has room for, the name a picker
 * leads with, and the postal line under it — and which one is right is the
 * surface's question, not the query's. They already live together in
 * `lib/address-format.ts`, where a test covers the empty-part rules, and three
 * surfaces that never touch a collection use them on rows they were handed.
 *
 * They also cannot be a compiled `select`. Each one joins the parts that are
 * present and drops the ones that are not, and the expression language has no way
 * to say "join these with a comma, skipping the empty ones" — `concat` would put
 * `, ,` where a missing line was. So the query narrows to the parts and the
 * formatting stays where it is.
 */

/**
 * An Address, as everything that shows one wants it.
 *
 * Structurally what `lib/address-format.ts` reads, plus the id a link needs. The
 * geometry columns are absent: an Address's own map surface reads those through
 * `/map/addresses`, and nothing that merely *names* an address needs them.
 */
export interface Address {
	readonly id: string;
	/** The organization's own name for the place — "Riverside HOA clubhouse". */
	readonly displayName: string | null;
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
}

/**
 * The same Address, as it arrives joined onto a record that links one.
 *
 * Every field is additionally `undefined`, because that is what a `left` join
 * yields when it matches nothing — and here "matches nothing" covers both a record
 * that links no Address and one whose Address has not streamed in yet. `id` is the
 * field that tells them apart: it is the only one that cannot be null on a real
 * row, so `id === undefined` means there is nothing to show.
 *
 * It is a nested object inside the surface query rather than a second hook. A hook
 * would have to wait for the record before it knew which Address to ask for, which
 * is the round trip through React that joining exists to remove.
 */
export interface LinkedAddress {
	readonly id: string | undefined;
	readonly displayName: string | null | undefined;
	readonly addressLine1: string | null | undefined;
	readonly addressLine2: string | null | undefined;
	readonly locality: string | null | undefined;
	readonly region: string | null | undefined;
	readonly postalCode: string | null | undefined;
}

/**
 * A joined Address as a resolved one, or `undefined` when the join matched
 * nothing.
 *
 * Narrowing on `id` tells TypeScript that *this* field is present but says nothing
 * about its siblings, so they are normalized here rather than at each of the two
 * readouts. One place, and the `id === undefined` rule is written down once.
 */
export function resolveLinkedAddress(address: LinkedAddress): Address | undefined {
	return address.id === undefined
		? undefined
		: {
				id: address.id,
				displayName: address.displayName ?? null,
				addressLine1: address.addressLine1 ?? null,
				addressLine2: address.addressLine2 ?? null,
				locality: address.locality ?? null,
				region: address.region ?? null,
				postalCode: address.postalCode ?? null,
			};
}

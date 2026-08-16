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
	/** The agency's own name for the place — "Riverside HOA clubhouse". */
	readonly displayName: string | null;
	readonly addressLine1: string | null;
	readonly addressLine2: string | null;
	readonly locality: string | null;
	readonly region: string | null;
	readonly postalCode: string | null;
}

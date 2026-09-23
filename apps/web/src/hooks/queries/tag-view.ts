/**
 * What a Tag looks like above the query layer.
 *
 * Not a hook, so not a `use-` file.
 *
 * A Tag is the organization's own label on a record — "priority", "needs access
 * code", "county property" — and it is deliberately free-form: SIMMER does not
 * know what any of them mean. So there is nothing to resolve here beyond the
 * name and the colour, and every surface that shows one shows the same two
 * things.
 */

export interface Tag {
	readonly id: string;
	readonly name: string;
	/** A hex string the organization chose, or `null`. Validated where it is rendered. */
	readonly color: string | null;
	/** Shown as the chip's tooltip, so a cryptic label can explain itself. */
	readonly description: string | null;
}

/**
 * A Tag on a record, with the id of the row that put it there.
 *
 * `unassignTag` takes `tag_items.id` and nothing else, so a surface that can
 * take a Tag off a record needs the link row's id beside the catalog row's. It
 * is a second type rather than a wider `Tag` because `Tag` is what the five map
 * cards, the explorer rows, `activity-data.ts`, `service-request-nearby.ts`,
 * `use-entity-tags.ts` and `use-tag-options.ts` all take, and the last two have
 * no link row at all. Every read-only chip drawer keeps taking `Tag` and is fed
 * one of these structurally.
 */
export interface AssignedTag extends Tag {
	readonly tagItemId: string;
}

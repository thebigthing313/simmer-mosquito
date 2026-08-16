/**
 * What a Tag looks like above the query layer.
 *
 * Not a hook, so not a `use-` file.
 *
 * A Tag is the agency's own label on a record — "priority", "needs access code",
 * "county property" — and it is deliberately free-form: SIMMER does not know what
 * any of them mean. So there is nothing to resolve here beyond the name and the
 * colour, and every surface that shows one shows the same two things.
 */

export interface Tag {
	readonly id: string;
	readonly name: string;
	/** A hex string the agency chose, or `null`. Validated where it is rendered. */
	readonly color: string | null;
	/** Shown as the chip's tooltip, so a cryptic label can explain itself. */
	readonly description: string | null;
}

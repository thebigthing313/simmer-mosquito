/**
 * What every intent map needs and no one table owns.
 *
 * Small on purpose. A builder is a translation from column names to domain
 * arguments, and almost nothing about that translation generalizes — the one
 * thing that does is how a client withholds an acknowledgement, because the
 * convention is the same on all of them.
 */

/**
 * An acknowledgement the caller did not withhold.
 *
 * The delete and lifecycle commands take flags a client sets to `false` to say
 * "I have not confirmed this yet"; absent means confirmed, which is what the
 * existing endpoints already do. One reading rather than one per table, so a
 * map that spells it `!== false` and a map that spells it `=== true` cannot
 * both exist.
 */
export function acknowledged(value: unknown): boolean {
	return value !== false;
}

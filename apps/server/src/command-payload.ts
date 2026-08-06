/**
 * Readers for the untrusted JSON a command endpoint receives.
 *
 * These sat in a per-domain copy in every `*-commands/shared.ts` and in several
 * of the standalone command modules — 36 copies of four functions, byte for
 * byte. They are the first thing every write endpoint touches, so a change to
 * what counts as an empty string or a usable number has to land in one place.
 *
 * Context-free by design: nothing here knows about the agency, the actor, or
 * the command being built. Ownership, role, and lifecycle checks belong in the
 * command handlers (see `docs/domain-command-contract.md`); these only turn
 * `unknown` into a typed value or nothing.
 */

/** Narrow an unknown to a plain object — not an array, not null. */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A non-empty trimmed string, or null.
 *
 * Whitespace-only is null rather than `''`: a field a user tabbed through is
 * absent, not set to blank.
 */
export function readText(value: unknown): string | null {
	if (typeof value !== 'string') {
		return null;
	}
	const trimmed = value.trim();
	return trimmed.length === 0 ? null : trimmed;
}

/**
 * The same reading, named for the columns it feeds.
 *
 * Kept distinct from {@link readText} so a nullable column's mapping still says
 * so at the call site.
 */
export function readNullableText(value: unknown): string | null {
	return readText(value);
}

/** A finite number, or undefined. NaN and Infinity are not values. */
export function readNumber(value: unknown): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

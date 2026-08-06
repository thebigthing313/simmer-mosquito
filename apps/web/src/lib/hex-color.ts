/**
 * Hex colour handling for the agency-defined colours that reach the UI as free
 * text — tag colours, mostly, which an admin types into a settings field.
 *
 * These lived in eight copies across components and route files before this
 * module existed, in three variants that disagreed about the edge cases. What
 * is here is the union of all three, so every previous caller gets the same
 * answer for the inputs it actually passes and a valid answer for the ones it
 * did not handle.
 */

/**
 * A colour we are willing to put in a style attribute, or null.
 *
 * Deliberately strict: six hex digits, nothing else. A stored value that does
 * not match is treated as absent rather than passed through, so a typo in a
 * settings field cannot reach CSS and render as some browser's guess.
 */
export function validHexColor(value: string | null): string | null {
	if (value === null) {
		return null;
	}

	const normalized = value.trim();
	return /^#[0-9a-fA-F]{6}$/.test(normalized) ? normalized : null;
}

/**
 * Append an alpha channel to a hex colour, as `#rrggbbaa`.
 *
 * Shorthand (`#abc`) is expanded first: appending two digits to a four-character
 * string yields six, which reads as a valid `#rrggbb` and silently renders the
 * wrong colour rather than failing. Alpha is clamped, because a value outside
 * 0–1 rounds to more than two hex digits and produces a string no browser will
 * parse. Both cases are unreachable from today's call sites — every one passes a
 * `validHexColor` result with a literal 0.14 or 0.36 — and both are cheap enough
 * to keep the function total.
 */
export function hexWithAlpha(hex: string, alpha: number): string {
	const expanded =
		hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
	const alphaHex = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
		.toString(16)
		.padStart(2, '0');
	return `${expanded}${alphaHex}`;
}

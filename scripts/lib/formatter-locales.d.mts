/**
 * Types for `formatter-locales.mjs`, so a TypeScript suite can pin the call
 * reader `check-formatter-locales.mjs` holds the display-formatter convention
 * with.
 *
 * The module is JavaScript because every gate under `scripts/` is, and the
 * workspace compiles no JavaScript. This file is what lets one TypeScript suite
 * across the boundary; it is declarations only, so nothing is emitted and it
 * sits outside the project's `rootDir` the way `masked-source.d.mts` does.
 */

/** One formatter call: which of the five, where, what it passed first, and what is wrong. */
export interface FormatterCall {
	readonly form: string;
	readonly index: number;
	readonly argument: string;
	readonly problem: string | null;
}

export function formatterCalls(source: string): FormatterCall[];

/**
 * Types for `masked-source.mjs`, so a TypeScript suite can pin the scan the
 * static gates read the tree through.
 *
 * The module is JavaScript because every gate under `scripts/` is, and the
 * workspace compiles no JavaScript. This file is what lets one TypeScript suite
 * across the boundary; it is declarations only, so nothing is emitted and it
 * sits outside the project's `rootDir` the way `stylesheet-tokens.d.mts` does.
 */

/** One span the scan blanked as a comment, delimiters included. */
export interface SourceComment {
	readonly index: number;
	readonly end: number;
}

/** One string literal body, with the 40 characters of source in front of its delimiter. */
export interface SourceLiteral {
	readonly text: string;
	readonly index: number;
	readonly before: string;
}

/** One pass over a file: what was blanked, what was collected, and the masked copy. */
export interface SourceScan {
	readonly comments: readonly SourceComment[];
	readonly literals: readonly SourceLiteral[];
	readonly masked: string;
}

export function scan(source: string): SourceScan;

export function maskedSource(source: string): string;

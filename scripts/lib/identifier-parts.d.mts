/**
 * Types for `identifier-parts.mjs`, so a TypeScript suite can pin the part
 * split the identifier half of `check-vocabulary.mjs` reads the tree through.
 *
 * The module is JavaScript because every gate under `scripts/` is, and the
 * workspace compiles no JavaScript. This file is what lets one TypeScript suite
 * across the boundary; it is declarations only, so nothing is emitted and it
 * sits outside the project's `rootDir` the way `masked-source.d.mts` does.
 */

/** One identifier token, with the index it starts at in the masked source. */
export interface SourceIdentifier {
	readonly name: string;
	readonly index: number;
}

export function identifiersIn(masked: string): SourceIdentifier[];

export function partsOf(name: string): string[];

export function spells(name: string, word: string): boolean;

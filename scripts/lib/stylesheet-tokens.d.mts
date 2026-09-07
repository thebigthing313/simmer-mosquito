/**
 * Types for `stylesheet-tokens.mjs`, so the contrast guard can import the
 * reader the gates use rather than keeping a second copy of the parse.
 *
 * The module is JavaScript because every gate under `scripts/` is, and the
 * workspace compiles no JavaScript. This file is what lets one TypeScript
 * suite across the boundary; it is declarations only, so nothing is emitted.
 */

export interface CssDeclaration {
	readonly name: string;
	readonly value: string;
}

export function readDeclarations(path: string): CssDeclaration[];

export function readBlockDeclarations(path: string, selector: string): CssDeclaration[];

/**
 * Types for `unread-declarations.mjs`, so a TypeScript suite can pin the
 * detector `check:unread-declarations` reads the tree with.
 *
 * The module is JavaScript because every gate under `scripts/` is, and the
 * workspace compiles no JavaScript. This file is what lets one TypeScript suite
 * across the boundary; it is declarations only, so nothing is emitted and it
 * sits outside the project's `rootDir` the way `masked-source.d.mts` does.
 */

/** One declaration nothing reads: the name as written, and the line it is on. */
export interface UnreadDeclaration {
	readonly name: string;
	readonly line: number;
}

export function unreadDeclarations(path: string, source: string): UnreadDeclaration[];

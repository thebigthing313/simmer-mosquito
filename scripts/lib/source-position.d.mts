/**
 * Types for `source-position.mjs`, so a TypeScript suite can pin the line count
 * every static gate's `path:line` message is built from.
 *
 * The module is JavaScript because every gate under `scripts/` is, and the
 * workspace compiles no JavaScript. This file is what lets one TypeScript suite
 * across the boundary; it is declarations only, so nothing is emitted and it
 * sits outside the project's `rootDir` the way `masked-source.d.mts` does.
 */

export function lineOf(source: string, index: number): number;

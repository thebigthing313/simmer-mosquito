/**
 * Types for `compiler-phases.mjs`, so an app's `vite.config.ts` can hand the
 * React Compiler the same allowlist the bail-out gate reads.
 *
 * The module is JavaScript because every gate under `scripts/` is, and the
 * workspace compiles no JavaScript. This file is what lets a TypeScript config
 * across that boundary, the way `stylesheet-tokens.d.mts` lets the contrast
 * guard across it. Declarations only, so nothing is emitted and nothing here
 * sits inside any project's `rootDir`.
 */

/** Every path pattern of every switched-on phase, oldest phase first. */
export function compilerIncludes(): RegExp[];

/** Whether one module is inside the allowlist. */
export function isOptedIn(path: string): boolean;

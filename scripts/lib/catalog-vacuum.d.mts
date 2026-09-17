/**
 * Types for `catalog-vacuum.mjs`, so a TypeScript suite can pin the session
 * `vacuum-catalogs.mjs` sends and the reading it makes of what comes back.
 *
 * The module is JavaScript because every script under `scripts/` is, and the
 * workspace compiles no JavaScript. This file is what lets one TypeScript suite
 * across the boundary; it is declarations only, so nothing is emitted and it
 * sits outside the project's `rootDir` the way `masked-source.d.mts` does.
 */

/** One other backend on the database, as `pg_stat_activity` reports it. */
export interface OtherBackend {
	readonly pid: number;
	readonly address: string;
	readonly application: string;
	readonly state: string;
}

/** Bytes per catalog, keyed by `relname`. */
export type CatalogSizes = Readonly<Record<string, number>>;

/** What the psql session said, or why it quit. */
export interface Session {
	readonly backends: OtherBackend[];
	readonly before: CatalogSizes | null;
	readonly after: CatalogSizes | null;
}

export const CATALOGS: readonly string[];

export function sessionSql(): string;

export function parseSession(stdout: string): Session;

export function refusal(backends: readonly OtherBackend[], database: string): string;

export function sessionFailure(session: Session, database: string): string | null;

export function formatBytes(bytes: number): string;

export function report(before: CatalogSizes, after: CatalogSizes): string;

/**
 * Types for `schema-dump.mjs`, so a TypeScript suite can pin what
 * `db-migrate.mjs` reads out of a dump and out of dbmate's output.
 *
 * Declarations only, so nothing is emitted and it sits outside the project's
 * `rootDir` the way `catalog-vacuum.d.mts` does.
 */

/** Where `findExecutable` looks, and the one filesystem question it asks. */
export interface LookupEnvironment {
	readonly platform: string;
	readonly path: string | undefined;
	readonly pathext?: string | undefined;
	readonly isFile: (path: string) => boolean;
}

/** What a run applied, what the dump names after it, and whether dbmate wrote it. */
export interface DumpState {
	readonly applied: readonly string[];
	readonly dumped: readonly string[];
	readonly rewritten: boolean;
}

/** What `staleDump` found wrong with the dump. */
export interface StaleDump {
	readonly rewritten: boolean;
	readonly undumped: string[];
}

export function writesDump(
	args: readonly string[],
	env: Readonly<Record<string, string | undefined>>,
): boolean;

/** What the wrapper knows once dbmate has exited. */
export interface DbmateRun {
	readonly code: number | null;
	readonly checked: boolean;
	readonly output: string;
	readonly sql: string;
	readonly rewritten: boolean;
}

/** The wrapper's exit code, and the message to print with it. */
export interface Verdict {
	readonly exitCode: number;
	readonly message: string | null;
}

export function afterDbmate(run: DbmateRun): Verdict;

export function dumpedVersions(sql: string): string[];

export function appliedVersions(output: string): string[];

export function staleDump(state: DumpState): StaleDump | null;

export function findExecutable(name: string, environment: LookupEnvironment): string | null;

export function missingPgDumpMessage(): string;

export function staleDumpMessage(stale: StaleDump): string;

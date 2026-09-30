/**
 * Types for `schema-dump.mjs`, so a TypeScript suite can pin what
 * `db-migrate.mjs` reads out of a dump and out of dbmate's output, for
 * `db:migrate` and `db:rollback` alike.
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

/** What a run applied or rolled back, what the dump names after it, and whether dbmate wrote it. */
export interface DumpState {
	readonly applied: readonly string[];
	readonly rolledBack: readonly string[];
	readonly dumped: readonly string[];
	readonly rewritten: boolean;
}

/**
 * What `staleDump` found wrong with the dump: applied versions it leaves out,
 * and rolled-back versions it still names.
 */
export interface StaleDump {
	readonly rewritten: boolean;
	readonly undumped: string[];
	readonly lingering: string[];
}

/** The three dbmate commands the wrapper runs. */
export type DumpingCommand = 'up' | 'rollback' | 'dump';

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

export function rolledBackVersions(output: string): string[];

export function staleDump(state: DumpState): StaleDump | null;

export function findExecutable(name: string, environment: LookupEnvironment): string | null;

export function staleDumpMessage(stale: StaleDump): string;

export const PUBLISHED_PORT: number;

export const URL_VARIABLE: string;

export const CONTAINER_VARIABLE: string;

/** What `pg_dump --version` names. */
export interface PgDumpVersion {
	readonly major: number;
	readonly minor: number;
}

export function pgDumpVersion(answer: string): PgDumpVersion | null;

export function dumpsCheckedInBytes(version: PgDumpVersion | null): boolean;

export function withPublicSearchPath(url: string): string;

/** Where the arguments tell dbmate to read its URL, and the arguments without `--url` and `--env`. */
export interface UrlArguments {
	readonly url: string | undefined;
	readonly env: string | undefined;
	readonly envFiles: string[];
	readonly rest: string[];
}

export function urlArguments(args: readonly string[]): UrlArguments;

export function parseEnvFile(text: string): Record<string, string>;

/** What `resolveDatabaseUrl` reads: the two flags, the process's variables and each env file's, in order. */
export interface UrlSources {
	readonly url: string | undefined;
	readonly env: string | undefined;
	readonly processEnv: Readonly<Record<string, string | undefined>>;
	readonly files: readonly Readonly<Record<string, string>>[];
}

export function resolveDatabaseUrl(sources: UrlSources): string | null;

export function containerUrlProblem(url: string | null, platform: string): string | null;

export function containerNameProblem(names: readonly string[] | null): string | null;

export function containerVersionProblem(name: string, version: PgDumpVersion | null): string | null;

export function containerDumpArgs(args: readonly string[]): string[];

/** The `pg_dump` on the PATH, and the version it answered. */
export interface LocalPgDump {
	readonly path: string;
	readonly version: PgDumpVersion | null;
}

export function containerNotice(use: {
	readonly name: string;
	readonly version: PgDumpVersion;
	readonly local: LocalPgDump | null;
}): string;

/** What `choosePgDump` decides from, the two docker questions included. */
export interface PgDumpQuestions {
	readonly command: DumpingCommand;
	readonly local: LocalPgDump | null;
	readonly url: string | null;
	readonly platform: string;
	readonly listContainers: () => string[] | null;
	readonly containerVersion: (name: string) => PgDumpVersion | null;
}

/** Which `pg_dump` writes the dump, or the refusal to print when none can. */
export type PgDumpChoice =
	| { readonly use: 'path'; readonly refusal?: undefined }
	| {
			readonly use: 'container';
			readonly name: string;
			readonly version: PgDumpVersion;
			readonly local: LocalPgDump | null;
			readonly refusal?: undefined;
	  }
	| { readonly use?: undefined; readonly refusal: string };

export function choosePgDump(questions: PgDumpQuestions): PgDumpChoice;

export function pgDumpRefusal(refusal: {
	readonly command: DumpingCommand;
	readonly local: LocalPgDump | null;
	readonly problem: string;
}): string;

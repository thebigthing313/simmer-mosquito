import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface UpMigration {
	/** The migration's file name, so a failure can name the file that caused it. */
	readonly name: string;
	/** The `-- migrate:up` body, verbatim apart from surrounding whitespace. */
	readonly sql: string;
}

/**
 * Statements Postgres refuses to run inside a transaction block.
 *
 * The whole migration set is applied as one multi-statement query, which
 * Postgres wraps in an implicit transaction. No migration needs any of these
 * today, and the set is checked rather than assumed: a future migration that
 * reaches for one has to be noticed here, where the message can say so, rather
 * than surface as an opaque "cannot run inside a transaction block" from a
 * twenty-six-migration string.
 */
const TRANSACTION_HOSTILE = [
	{ pattern: /\bconcurrently\b/i, statement: 'CREATE/DROP INDEX CONCURRENTLY' },
	{ pattern: /\bvacuum\b/i, statement: 'VACUUM' },
	{ pattern: /\breindex\b/i, statement: 'REINDEX' },
	{ pattern: /\bcreate\s+database\b/i, statement: 'CREATE DATABASE' },
	{ pattern: /\bdrop\s+database\b/i, statement: 'DROP DATABASE' },
	{ pattern: /\balter\s+system\b/i, statement: 'ALTER SYSTEM' },
	{ pattern: /\bcreate\s+tablespace\b/i, statement: 'CREATE TABLESPACE' },
] as const;

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations');

/**
 * Read `packages/db/migrations` and return every `migrate:up` body in the order
 * dbmate would apply them.
 *
 * The directory is the only input, so a new migration is picked up by adding the
 * file and nothing else.
 */
export async function readUpMigrations(directory: string = migrationsDir): Promise<UpMigration[]> {
	const files = (await readdir(directory))
		.filter((file) => file.endsWith('.sql'))
		.sort((left, right) => left.localeCompare(right));

	return Promise.all(
		files.map(async (name) => ({
			name,
			sql: extractUpMigration(name, await readFile(join(directory, name), 'utf8')),
		})),
	);
}

/**
 * Pull the `migrate:up` body out of one migration file.
 *
 * The body is taken whole and never split on semicolons: nine migrations carry
 * dollar-quoted function and trigger bodies, and a semicolon inside `$$ ... $$`
 * is content, not a statement boundary.
 */
export function extractUpMigration(name: string, contents: string): string {
	const up = contents.match(/-- migrate:up\s*([\s\S]*?)\s*-- migrate:down/);
	if (up?.[1] === undefined) {
		throw new Error(`Migration ${name} is missing migrate:up or migrate:down markers.`);
	}

	const body = up[1].trim();
	const hostile = TRANSACTION_HOSTILE.find(({ pattern }) => pattern.test(stripComments(body)));
	if (hostile !== undefined) {
		throw new Error(
			`Migration ${name} uses ${hostile.statement}, which cannot run inside a transaction block. ` +
				'The test harness applies the whole migration set as one query, so it cannot ' +
				'apply this migration. Apply it separately in the harness or avoid the statement.',
		);
	}

	return body;
}

/**
 * Join the ordered bodies into the single query the harness sends.
 *
 * `set search_path` leads rather than being issued separately: it has to reach
 * the same connection as the DDL that depends on it, and being the first
 * statement of the same query is the only way to guarantee that without holding
 * a connection open by hand.
 */
export function buildMigrationSql(migrations: readonly UpMigration[], schemaName: string): string {
	const statements = migrations.map(({ name, sql }) => `-- ${name}\n${terminate(sql)}`);
	return [`set search_path to ${schemaName}, public;`, ...statements].join('\n\n');
}

/**
 * A body whose last statement has no trailing semicolon would swallow the first
 * statement of the next migration, so the separator is added rather than assumed.
 */
function terminate(sql: string): string {
	return sql.endsWith(';') ? sql : `${sql};`;
}

function stripComments(sql: string): string {
	return sql.replaceAll(/--[^\n]*/g, '');
}

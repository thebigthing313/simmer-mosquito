import { describe, expect, it } from 'vitest';
import {
	buildMigrationSql,
	extractUpMigration,
	readUpMigrations,
} from '../../../test-support/migration-sql.js';

describe('readUpMigrations', () => {
	it('returns every migration in the directory, ordered by file name', async () => {
		const migrations = await readUpMigrations();

		expect(migrations.length).toBeGreaterThanOrEqual(26);
		expect(migrations.map(({ name }) => name)).toEqual(
			[...migrations.map(({ name }) => name)].sort((left, right) => left.localeCompare(right)),
		);
		expect(migrations.every(({ name }) => name.endsWith('.sql'))).toBe(true);
	});

	it('reads the up bodies only', async () => {
		const migrations = await readUpMigrations();

		for (const { sql } of migrations) {
			expect(sql).not.toContain('-- migrate:down');
			expect(sql).not.toContain('-- migrate:up');
		}
	});

	// The set is applied as one multi-statement query, which Postgres runs in an
	// implicit transaction. This is the check that a new migration cannot quietly
	// introduce a statement that arrangement cannot carry.
	it('accepts every migration in the workspace', async () => {
		await expect(readUpMigrations()).resolves.toBeDefined();
	});
});

describe('extractUpMigration', () => {
	it('takes the body between the markers', () => {
		const body = extractUpMigration(
			'x.sql',
			'-- migrate:up\ncreate table t (id int);\n\n-- migrate:down\ndrop table t;\n',
		);

		expect(body).toBe('create table t (id int);');
	});

	it('raises naming the file when a marker is missing', () => {
		expect(() =>
			extractUpMigration('202605060001_identity.sql', 'create table t (id int);'),
		).toThrow(/202605060001_identity\.sql is missing migrate:up or migrate:down markers/);
	});

	// Semicolon-splitting a migration would corrupt these, which is why bodies are
	// only ever joined whole.
	it('keeps a dollar-quoted body intact', () => {
		const trigger = [
			'create function touch() returns trigger as $$',
			'begin',
			'  new.updated_at = now(); -- a semicolon inside the body; and another;',
			'  return new;',
			'end;',
			'$$ language plpgsql;',
		].join('\n');

		const body = extractUpMigration('x.sql', `-- migrate:up\n${trigger}\n-- migrate:down\n`);

		expect(body).toBe(trigger);
	});

	it('rejects a statement that cannot run inside a transaction block', () => {
		expect(() =>
			extractUpMigration(
				'202699990001_slow_index.sql',
				'-- migrate:up\ncreate index concurrently t_idx on t (id);\n-- migrate:down\n',
			),
		).toThrow(/202699990001_slow_index\.sql uses CREATE\/DROP INDEX CONCURRENTLY/);
	});

	// A migration that only mentions one in prose is not using one.
	it('ignores transaction-hostile words inside comments', () => {
		expect(() =>
			extractUpMigration(
				'x.sql',
				'-- migrate:up\n-- built concurrently in production; vacuum afterwards\ncreate index t_idx on t (id);\n-- migrate:down\n',
			),
		).not.toThrow();
	});
});

describe('buildMigrationSql', () => {
	it('leads with the search path so it travels with the DDL that needs it', () => {
		const sql = buildMigrationSql(
			[{ name: 'a.sql', sql: 'create table t (id int);' }],
			'simmer_test_1',
		);

		expect(sql.startsWith('set search_path to simmer_test_1, public;')).toBe(true);
	});

	it('keeps the migrations in order and names each one', () => {
		const sql = buildMigrationSql(
			[
				{ name: 'a.sql', sql: 'create table a (id int);' },
				{ name: 'b.sql', sql: 'create table b (id int);' },
			],
			'simmer_test_1',
		);

		expect(sql.indexOf('-- a.sql')).toBeLessThan(sql.indexOf('-- b.sql'));
		expect(sql.indexOf('create table a')).toBeLessThan(sql.indexOf('create table b'));
	});

	it('terminates a body that does not end in a semicolon', () => {
		const sql = buildMigrationSql(
			[
				{ name: 'a.sql', sql: 'create table a (id int)' },
				{ name: 'b.sql', sql: 'create table b (id int);' },
			],
			'simmer_test_1',
		);

		expect(sql).toContain('create table a (id int);');
	});

	it('carries dollar-quoted bodies through byte for byte', async () => {
		const migrations = await readUpMigrations();
		const sql = buildMigrationSql(migrations, 'simmer_test_1');

		for (const migration of migrations) {
			expect(sql).toContain(migration.sql);
		}
	});
});

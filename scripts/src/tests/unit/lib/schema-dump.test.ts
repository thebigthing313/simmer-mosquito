/**
 * The half of `db-migrate.mjs` that never touches a database: where `pg_dump`
 * would be found, which versions a dump names, which versions dbmate says it
 * applied or rolled back, and the two refusals the wrapper prints.
 *
 * The wrapper spawns dbmate and cannot be imported without a database in front
 * of it, so everything answerable from text is answered here, the way
 * `catalog-vacuum.test.ts` reaches the half of `vacuum-catalogs.mjs` that
 * needs no container.
 */

import { describe, expect, it } from 'vitest';
import {
	afterDbmate,
	appliedVersions,
	dumpedVersions,
	findExecutable,
	missingPgDumpMessage,
	rolledBackVersions,
	staleDump,
	staleDumpMessage,
	writesDump,
} from '../../../../lib/schema-dump.mjs';

const DUMP_TAIL = [
	'--',
	'-- Dbmate schema migrations',
	'--',
	'',
	'INSERT INTO public.schema_migrations (version) VALUES',
	"    ('202605060006'),",
	"    ('202609240001'),",
	"    ('202609290001');",
	'',
].join('\n');

describe('afterDbmate', () => {
	const applied = 'Applying: 202609290001_a.sql\nApplied: 202609290001_a.sql in 1ms\n';

	it('keeps the code of a dbmate that failed, and adds nothing to its message', () => {
		expect(afterDbmate({ code: 3, checked: true, output: '', sql: '', rewritten: false })).toEqual({
			exitCode: 3,
			message: null,
		});
		expect(
			afterDbmate({ code: null, checked: true, output: '', sql: '', rewritten: false }),
		).toEqual({ exitCode: 1, message: null });
	});

	it('passes a run whose dump was rewritten with every applied version', () => {
		expect(
			afterDbmate({ code: 0, checked: true, output: applied, sql: DUMP_TAIL, rewritten: true }),
		).toEqual({ exitCode: 0, message: null });
	});

	it('fails a run that applied a migration and left the dump alone', () => {
		const verdict = afterDbmate({
			code: 0,
			checked: true,
			output: applied,
			sql: DUMP_TAIL,
			rewritten: false,
		});
		expect(verdict.exitCode).toBe(1);
		expect(verdict.message).toContain('did not rewrite packages/db/schema.sql');
	});

	it('fails a rewritten dump that does not name the applied version', () => {
		const verdict = afterDbmate({
			code: 0,
			checked: true,
			output: 'Applying: 202610010001_b.sql\n',
			sql: DUMP_TAIL,
			rewritten: true,
		});
		expect(verdict.exitCode).toBe(1);
		expect(verdict.message).toContain('202610010001');
	});

	it('passes a rollback whose rewritten dump no longer names the version', () => {
		expect(
			afterDbmate({
				code: 0,
				checked: true,
				output: 'Rolling back: 202609300001_b.sql\nRolled back: 202609300001_b.sql in 2ms\n',
				sql: DUMP_TAIL,
				rewritten: true,
			}),
		).toEqual({ exitCode: 0, message: null });
	});

	it('fails a rollback that left the dump alone', () => {
		const verdict = afterDbmate({
			code: 0,
			checked: true,
			output: 'Rolling back: 202609290001_a.sql\n',
			sql: DUMP_TAIL,
			rewritten: false,
		});
		expect(verdict.exitCode).toBe(1);
		expect(verdict.message).toContain('did not rewrite packages/db/schema.sql');
	});

	it('fails a rewritten dump that still names the rolled-back version', () => {
		const verdict = afterDbmate({
			code: 0,
			checked: true,
			output: 'Rolling back: 202609290001_a.sql\n',
			sql: DUMP_TAIL,
			rewritten: true,
		});
		expect(verdict.exitCode).toBe(1);
		expect(verdict.message).toContain('202609290001');
	});

	it('passes a run that opted out of the dump', () => {
		expect(
			afterDbmate({ code: 0, checked: false, output: applied, sql: '', rewritten: false }),
		).toEqual({ exitCode: 0, message: null });
	});
});

describe('dumpedVersions', () => {
	it('reads every version in the schema_migrations insert, sorted', () => {
		expect(dumpedVersions(DUMP_TAIL)).toEqual(['202605060006', '202609240001', '202609290001']);
	});

	it('reads the last line whether it ends in a comma or a semicolon', () => {
		expect(dumpedVersions("    ('1');\n")).toEqual(['1']);
		expect(dumpedVersions("    ('1'),\n")).toEqual(['1']);
	});

	it('reads a dump written with CRLF line ends', () => {
		expect(dumpedVersions(DUMP_TAIL.replaceAll('\n', '\r\n'))).toEqual([
			'202605060006',
			'202609240001',
			'202609290001',
		]);
	});

	it('reads nothing out of a quoted number elsewhere in the dump', () => {
		expect(dumpedVersions("CHECK (kind = ANY (ARRAY['1'::text]))\n")).toEqual([]);
	});
});

describe('appliedVersions', () => {
	it('reads the version off each Applying line dbmate prints', () => {
		const output = [
			'Applying: 202609290001_region_membership.sql',
			'Applied: 202609290001_region_membership.sql in 41.2ms',
			'Applying: 202609300001_assignment_detail.sql',
			'Applied: 202609300001_assignment_detail.sql in 3ms',
			'Writing: packages/db/schema.sql',
		].join('\n');
		expect(appliedVersions(output)).toEqual(['202609290001', '202609300001']);
	});

	it('reads nothing when dbmate had nothing to apply', () => {
		expect(appliedVersions('')).toEqual([]);
	});

	it('reads CRLF output', () => {
		expect(appliedVersions('Applying: 7_a.sql\r\nApplied: 7_a.sql in 1ms\r\n')).toEqual(['7']);
	});

	it('reads a path whose migrations directory is spelled out', () => {
		expect(appliedVersions('Applying: packages/db/migrations/7_a.sql\n')).toEqual(['7']);
	});
});

describe('rolledBackVersions', () => {
	it('reads the version off the Rolling back line dbmate prints', () => {
		const output = [
			'Rolling back: 202609300001_assignment_detail.sql',
			'Rolled back: 202609300001_assignment_detail.sql in 12ms',
			'Writing: packages/db/schema.sql',
		].join('\n');
		expect(rolledBackVersions(output)).toEqual(['202609300001']);
	});

	it('reads nothing when dbmate had nothing to roll back', () => {
		expect(rolledBackVersions('')).toEqual([]);
	});

	it('reads CRLF output and a spelled-out migrations directory', () => {
		expect(rolledBackVersions('Rolling back: packages/db/migrations/7_a.sql\r\n')).toEqual(['7']);
	});

	it('reads neither an Applying line nor a Rolled back line', () => {
		expect(rolledBackVersions('Applying: 7_a.sql\nRolled back: 8_b.sql in 1ms\n')).toEqual([]);
		expect(appliedVersions('Rolling back: 7_a.sql\n')).toEqual([]);
	});
});

describe('staleDump', () => {
	const none = { applied: [], rolledBack: [] };

	it('passes a run that changed nothing, however stale the dump is', () => {
		expect(staleDump({ ...none, dumped: [], rewritten: false })).toBeNull();
	});

	it('passes a rewritten dump naming every applied version', () => {
		expect(staleDump({ ...none, applied: ['2'], dumped: ['1', '2'], rewritten: true })).toBeNull();
	});

	it('names every applied version the rewritten dump leaves out', () => {
		expect(
			staleDump({ ...none, applied: ['1', '2', '3'], dumped: ['1', '3'], rewritten: true }),
		).toEqual({ rewritten: true, undumped: ['2'], lingering: [] });
	});

	it('fails a dump left unwritten even when it already names what was applied', () => {
		// A fresh database takes every migration the checked-in dump already
		// names, so the versions alone read clean while pg_dump failed.
		expect(
			staleDump({ ...none, applied: ['1', '2'], dumped: ['1', '2'], rewritten: false }),
		).toEqual({ rewritten: false, undumped: [], lingering: [] });
	});

	it('passes a rewritten dump that no longer names the rolled-back version', () => {
		expect(staleDump({ ...none, rolledBack: ['2'], dumped: ['1'], rewritten: true })).toBeNull();
	});

	it('names a rolled-back version the rewritten dump still names', () => {
		expect(staleDump({ ...none, rolledBack: ['2'], dumped: ['1', '2'], rewritten: true })).toEqual({
			rewritten: true,
			undumped: [],
			lingering: ['2'],
		});
	});

	it('fails a rollback whose dump was left unwritten', () => {
		expect(staleDump({ ...none, rolledBack: ['2'], dumped: ['1', '2'], rewritten: false })).toEqual(
			{ rewritten: false, undumped: [], lingering: ['2'] },
		);
	});
});

describe('writesDump', () => {
	it('is on by default', () => {
		expect(writesDump(['--url', 'postgres://x'], {})).toBe(true);
	});

	it('is off when the caller passes --no-dump-schema', () => {
		expect(writesDump(['--no-dump-schema'], {})).toBe(false);
	});

	it('is off when DBMATE_NO_DUMP_SCHEMA is true, the way dbmate reads it', () => {
		expect(writesDump([], { DBMATE_NO_DUMP_SCHEMA: 'true' })).toBe(false);
		expect(writesDump([], { DBMATE_NO_DUMP_SCHEMA: '1' })).toBe(false);
		expect(writesDump([], { DBMATE_NO_DUMP_SCHEMA: 'false' })).toBe(true);
		expect(writesDump([], { DBMATE_NO_DUMP_SCHEMA: '' })).toBe(true);
	});
});

describe('findExecutable', () => {
	const files = (...paths: string[]) => {
		const set = new Set(paths);
		return (path: string) => set.has(path);
	};

	it('finds a bare name on a POSIX PATH', () => {
		expect(
			findExecutable('pg_dump', {
				platform: 'linux',
				path: '/usr/local/bin:/usr/bin',
				isFile: files('/usr/bin/pg_dump'),
			}),
		).toBe('/usr/bin/pg_dump');
	});

	it('finds nothing when no PATH entry holds it', () => {
		expect(
			findExecutable('pg_dump', {
				platform: 'linux',
				path: '/usr/local/bin:/usr/bin',
				isFile: files('/opt/pg/bin/pg_dump'),
			}),
		).toBeNull();
	});

	it('finds nothing on an empty or absent PATH', () => {
		expect(
			findExecutable('pg_dump', { platform: 'linux', path: '', isFile: () => true }),
		).toBeNull();
		expect(
			findExecutable('pg_dump', { platform: 'linux', path: undefined, isFile: () => true }),
		).toBeNull();
	});

	it('tries each PATHEXT extension on Windows, the way Go looks it up for dbmate', () => {
		expect(
			findExecutable('pg_dump', {
				platform: 'win32',
				path: 'C:\\Windows;C:\\Program Files\\PostgreSQL\\17\\bin',
				pathext: '.COM;.EXE;.BAT;.CMD',
				isFile: files('C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.EXE'),
			}),
		).toBe('C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.EXE');
	});

	it('finds a .cmd shim on Windows', () => {
		expect(
			findExecutable('pg_dump', {
				platform: 'win32',
				path: 'C:\\shims',
				pathext: '.EXE;.CMD',
				isFile: files('C:\\shims\\pg_dump.CMD'),
			}),
		).toBe('C:\\shims\\pg_dump.CMD');
	});

	it('does not take an extensionless file on Windows, which Go would not run', () => {
		expect(
			findExecutable('pg_dump', {
				platform: 'win32',
				path: 'C:\\shims',
				pathext: '.EXE',
				isFile: files('C:\\shims\\pg_dump'),
			}),
		).toBeNull();
	});

	it('falls back to the default PATHEXT on Windows when none is set', () => {
		expect(
			findExecutable('pg_dump', {
				platform: 'win32',
				path: 'C:\\pg',
				pathext: undefined,
				isFile: files('C:\\pg\\pg_dump.exe'),
			}),
		).toBe('C:\\pg\\pg_dump.exe');
	});

	it('skips empty PATH entries rather than reading the working directory', () => {
		expect(
			findExecutable('pg_dump', { platform: 'linux', path: ':/usr/bin', isFile: files('pg_dump') }),
		).toBeNull();
	});
});

describe('the refusals', () => {
	it('names pg_dump, the file that would go stale, and how to get it', () => {
		const message = missingPgDumpMessage('up');
		expect(message).toContain('pg_dump');
		expect(message).toContain('packages/db/schema.sql');
		expect(message).toContain('no migration was applied');
		expect(message).toContain('`pnpm db:migrate`');
		expect(message).toMatch(/PATH/);
	});

	it('says nothing was rolled back when the rollback is refused', () => {
		const message = missingPgDumpMessage('rollback');
		expect(message).toContain('nothing was rolled back');
		expect(message).toContain('packages/db/schema.sql');
		expect(message).toContain('`pnpm db:rollback`');
		expect(message).not.toContain('no migration was applied');
	});

	it('names each version the dump is missing', () => {
		const message = staleDumpMessage({
			rewritten: true,
			undumped: ['202609300001', '202609300002'],
			lingering: [],
		});
		expect(message).toContain('202609300001');
		expect(message).toContain('202609300002');
		expect(message).toContain('packages/db/schema.sql');
	});

	it('says the dump was not written when dbmate left it alone', () => {
		const message = staleDumpMessage({ rewritten: false, undumped: [], lingering: [] });
		expect(message).toContain('did not rewrite packages/db/schema.sql');
		expect(message).toContain('pg_dump');
	});

	it('names each rolled-back version the dump still names', () => {
		const message = staleDumpMessage({
			rewritten: true,
			undumped: [],
			lingering: ['202609300001'],
		});
		expect(message).toContain('rolled back');
		expect(message).toContain('202609300001');
	});

	it('says the dump was not written after a rollback', () => {
		const message = staleDumpMessage({
			rewritten: false,
			undumped: [],
			lingering: ['202609300001'],
		});
		expect(message).toContain('rolled back');
		expect(message).toContain('did not rewrite packages/db/schema.sql');
	});
});

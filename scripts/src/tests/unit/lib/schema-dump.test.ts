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
	choosePgDump,
	containerDumpArgs,
	containerNameProblem,
	containerNotice,
	containerUrlProblem,
	containerVersionProblem,
	dumpedVersions,
	dumpsCheckedInBytes,
	findExecutable,
	parseEnvFile,
	pgDumpRefusal,
	pgDumpVersion,
	resolveDatabaseUrl,
	rolledBackVersions,
	staleDump,
	staleDumpMessage,
	urlArguments,
	withPublicSearchPath,
	writesDump,
} from '../../../../lib/schema-dump.mjs';

const COMPOSE_URL = 'postgres://postgres:postgres@127.0.0.1:55432/simmer_mosquito?sslmode=disable';

describe('pgDumpVersion', () => {
	it('reads the major and minor off what pg_dump --version prints', () => {
		expect(pgDumpVersion('pg_dump (PostgreSQL) 17.5\n')).toEqual({ major: 17, minor: 5 });
		expect(pgDumpVersion('pg_dump (PostgreSQL) 17.5 (Debian 17.5-1.pgdg110+1)\n')).toEqual({
			major: 17,
			minor: 5,
		});
		expect(pgDumpVersion('pg_dump (PostgreSQL) 18.0\r\n')).toEqual({ major: 18, minor: 0 });
	});

	it('reads no version out of a beta, an error or nothing', () => {
		expect(pgDumpVersion('pg_dump (PostgreSQL) 18beta1\n')).toBeNull();
		expect(
			pgDumpVersion("'pg_dump' is not recognized as an internal or external command"),
		).toBeNull();
		expect(pgDumpVersion('')).toBeNull();
	});
});

describe('dumpsCheckedInBytes', () => {
	it('takes 17.0 to 17.5, the clients that wrote the checked-in dump', () => {
		for (const minor of [0, 1, 4, 5]) {
			expect(dumpsCheckedInBytes({ major: 17, minor })).toBe(true);
		}
	});

	it('refuses 17.6 and later, which add the \\restrict lines, and 18', () => {
		expect(dumpsCheckedInBytes({ major: 17, minor: 6 })).toBe(false);
		expect(dumpsCheckedInBytes({ major: 17, minor: 11 })).toBe(false);
		expect(dumpsCheckedInBytes({ major: 18, minor: 0 })).toBe(false);
		expect(dumpsCheckedInBytes({ major: 18, minor: 6 })).toBe(false);
	});

	it('refuses 16, which aborts on a newer server, and a client with no version', () => {
		expect(dumpsCheckedInBytes({ major: 16, minor: 15 })).toBe(false);
		expect(dumpsCheckedInBytes(null)).toBe(false);
	});
});

describe('withPublicSearchPath', () => {
	it('adds search_path=public to a URL with a query', () => {
		expect(withPublicSearchPath(COMPOSE_URL)).toBe(`${COMPOSE_URL}&search_path=public`);
	});

	it('adds it to a URL with no query', () => {
		expect(withPublicSearchPath('postgres://u:p@127.0.0.1:55432/db')).toBe(
			'postgres://u:p@127.0.0.1:55432/db?search_path=public',
		);
	});

	it('leaves a URL that names its own search_path alone', () => {
		const url = `${COMPOSE_URL}&search_path=public`;
		expect(withPublicSearchPath(url)).toBe(url);
		expect(withPublicSearchPath('postgres://h/db?search_path=app,public')).toBe(
			'postgres://h/db?search_path=app,public',
		);
	});

	it('keeps an escaped password as written', () => {
		expect(withPublicSearchPath('postgres://u:p%40ss@h:1/db')).toBe(
			'postgres://u:p%40ss@h:1/db?search_path=public',
		);
	});

	it('leaves text that is not a URL alone rather than guessing', () => {
		expect(withPublicSearchPath('not a url')).toBe('not a url');
	});
});

describe('urlArguments', () => {
	it('reads --url in both spellings and takes it out of the rest', () => {
		expect(urlArguments(['--url', 'postgres://a', '--wait'])).toEqual({
			url: 'postgres://a',
			env: undefined,
			envFiles: [],
			rest: ['--wait'],
		});
		expect(urlArguments(['-u=postgres://a']).url).toBe('postgres://a');
	});

	it('reads --env and -e and takes them out of the rest', () => {
		expect(urlArguments(['--env', 'DUMP_DATABASE_URL']).env).toBe('DUMP_DATABASE_URL');
		expect(urlArguments(['-e', 'X', '--no-dump-schema'])).toEqual({
			url: undefined,
			env: 'X',
			envFiles: [],
			rest: ['--no-dump-schema'],
		});
	});

	it('reads every --env-file and leaves them in the rest, since dbmate reads other variables there', () => {
		expect(urlArguments(['--env-file', 'a.env', '--env-file=b.env'])).toEqual({
			url: undefined,
			env: undefined,
			envFiles: ['a.env', 'b.env'],
			rest: ['--env-file', 'a.env', '--env-file=b.env'],
		});
	});
});

describe('parseEnvFile', () => {
	it('reads plain, exported, quoted and commented lines', () => {
		expect(
			parseEnvFile(
				[
					'# a comment',
					'DATABASE_URL=postgres://a?x=1&y=2',
					'export PORT=3000',
					'QUOTED="a # not a comment"',
					"SINGLE='b'",
					'TRAILING=c # a comment',
					'not a line',
					'',
				].join('\r\n'),
			),
		).toEqual({
			DATABASE_URL: 'postgres://a?x=1&y=2',
			PORT: '3000',
			QUOTED: 'a # not a comment',
			SINGLE: 'b',
			TRAILING: 'c',
		});
	});
});

describe('resolveDatabaseUrl', () => {
	const none = { url: undefined, env: undefined, processEnv: {}, files: [] };

	it('takes --url first', () => {
		expect(
			resolveDatabaseUrl({ ...none, url: 'postgres://flag', processEnv: { DATABASE_URL: 'x' } }),
		).toBe('postgres://flag');
	});

	it('reads DATABASE_URL from the process before any file, the way godotenv does', () => {
		expect(
			resolveDatabaseUrl({
				...none,
				processEnv: { DATABASE_URL: 'postgres://process' },
				files: [{ DATABASE_URL: 'postgres://file' }],
			}),
		).toBe('postgres://process');
	});

	it('reads the variable --env names, from the first file that sets it', () => {
		expect(
			resolveDatabaseUrl({
				...none,
				env: 'DUMP_DATABASE_URL',
				files: [{ DATABASE_URL: 'postgres://wrong' }, { DUMP_DATABASE_URL: 'postgres://second' }],
			}),
		).toBe('postgres://second');
	});

	it('finds nothing when nothing sets it', () => {
		expect(resolveDatabaseUrl(none)).toBeNull();
		expect(resolveDatabaseUrl({ ...none, processEnv: { DATABASE_URL: '' } })).toBeNull();
	});
});

describe('containerUrlProblem', () => {
	it('takes the compose URL on 127.0.0.1, localhost and ::1', () => {
		expect(containerUrlProblem(COMPOSE_URL, 'win32')).toBeNull();
		expect(containerUrlProblem('postgresql://u:p@localhost:55432/db', 'linux')).toBeNull();
		expect(containerUrlProblem('postgres://u:p@[::1]:55432/db', 'linux')).toBeNull();
	});

	it('refuses a URL that reaches another server', () => {
		expect(containerUrlProblem('postgres://u:p@db.example.com:5432/db', 'linux')).toContain(
			'does not reach the compose Postgres',
		);
		expect(containerUrlProblem('postgres://u:p@127.0.0.1:5432/db', 'linux')).toContain(
			'does not reach the compose Postgres',
		);
	});

	it('refuses when there is no URL at all', () => {
		expect(containerUrlProblem(null, 'linux')).toContain('no database URL');
	});

	it('refuses two query parameters besides search_path on Windows, where cmd.exe splits at &', () => {
		const url = `${COMPOSE_URL}&application_name=x&search_path=public`;
		expect(containerUrlProblem(url, 'win32')).toContain('sslmode, application_name');
		expect(containerUrlProblem(url, 'linux')).toBeNull();
		expect(containerUrlProblem(`${COMPOSE_URL}&search_path=public`, 'win32')).toBeNull();
	});
});

describe('containerNameProblem', () => {
	it('takes exactly one container', () => {
		expect(containerNameProblem(['simmer-mosquito-postgres-1'])).toBeNull();
	});

	it('says why none or two are not one to use', () => {
		expect(containerNameProblem(null)).toBe('docker did not answer');
		expect(containerNameProblem([])).toContain('no running container publishes port 55432');
		expect(containerNameProblem(['a', 'b'])).toContain(
			'2 running containers publish port 55432, a, b',
		);
	});
});

describe('containerVersionProblem', () => {
	it('takes the container at 17.5 and names any other version', () => {
		expect(containerVersionProblem('pg', { major: 17, minor: 5 })).toBeNull();
		expect(containerVersionProblem('pg', { major: 17, minor: 6 })).toBe('pg_dump in pg is 17.6');
		expect(containerVersionProblem('pg', null)).toBe('pg_dump in pg names no version');
	});
});

describe('containerDumpArgs', () => {
	const flags = ['--format=plain', '--encoding=UTF8', '--schema-only', '--schema', 'public'];

	it('points the URL dbmate passes at the server from inside the container', () => {
		expect(containerDumpArgs([...flags, COMPOSE_URL])).toEqual([
			...flags,
			'postgres://postgres:postgres@127.0.0.1:5432/simmer_mosquito?sslmode=disable',
		]);
		expect(containerDumpArgs(['postgres://u@localhost:55432/db'])).toEqual([
			'postgres://u@127.0.0.1:5432/db',
		]);
		expect(containerDumpArgs(['postgres://u:p@[::1]:55432/db'])).toEqual([
			'postgres://u:p@127.0.0.1:5432/db',
		]);
	});

	it('leaves --version, the flags and any other URL as dbmate wrote them', () => {
		expect(containerDumpArgs(['--version'])).toEqual(['--version']);
		expect(containerDumpArgs(['postgres://u@db.example.com:55432/db'])).toEqual([
			'postgres://u@db.example.com:55432/db',
		]);
	});
});

describe('choosePgDump', () => {
	const asked: string[] = [];
	const base = {
		command: 'up' as const,
		local: null,
		url: COMPOSE_URL,
		platform: 'win32',
		listContainers: () => {
			asked.push('list');
			return ['pg-1'];
		},
		containerVersion: (name: string) => {
			asked.push(`version ${name}`);
			return { major: 17, minor: 5 };
		},
	};
	const tooNew = { path: '/usr/bin/pg_dump', version: { major: 17, minor: 6 } };

	it('keeps a local 17.0 to 17.5 and asks docker nothing', () => {
		asked.length = 0;
		expect(
			choosePgDump({
				...base,
				local: { path: '/usr/bin/pg_dump', version: { major: 17, minor: 2 } },
			}),
		).toEqual({ use: 'path' });
		expect(asked).toEqual([]);
	});

	it('falls back to the container with no local pg_dump', () => {
		asked.length = 0;
		expect(choosePgDump(base)).toEqual({
			use: 'container',
			name: 'pg-1',
			version: { major: 17, minor: 5 },
			local: null,
		});
		expect(asked).toEqual(['list', 'version pg-1']);
	});

	it('falls back to the container over a local client that is too new', () => {
		expect(choosePgDump({ ...base, local: tooNew })).toMatchObject({
			use: 'container',
			local: tooNew,
		});
	});

	it('refuses a too-new client, naming its version, when the URL reaches another server', () => {
		asked.length = 0;
		const choice = choosePgDump({
			...base,
			local: tooNew,
			url: 'postgres://u@db.example.com:5432/db',
		});
		expect(choice.refusal).toContain('pg_dump 17.6 at /usr/bin/pg_dump is not 17.0 to 17.5');
		expect(choice.refusal).toContain('does not reach the compose Postgres');
		expect(asked).toEqual([]);
	});

	it('refuses when no container publishes the port, or the one that does is too new', () => {
		expect(choosePgDump({ ...base, listContainers: () => [] }).refusal).toContain(
			'no running container publishes port 55432',
		);
		expect(
			choosePgDump({ ...base, containerVersion: () => ({ major: 18, minor: 0 }) }).refusal,
		).toContain('pg_dump in pg-1 is 18.0');
	});
});

describe('containerNotice', () => {
	it('names the container, its version and why the local client was passed over', () => {
		expect(containerNotice({ name: 'pg-1', version: { major: 17, minor: 5 }, local: null })).toBe(
			'Writing the dump with pg_dump 17.5 in pg-1, because no pg_dump is on the PATH.',
		);
		expect(
			containerNotice({
				name: 'pg-1',
				version: { major: 17, minor: 5 },
				local: { path: '/usr/bin/pg_dump', version: { major: 18, minor: 0 } },
			}),
		).toBe(
			'Writing the dump with pg_dump 17.5 in pg-1, because pg_dump 18.0 at /usr/bin/pg_dump is not 17.0 to 17.5.',
		);
	});
});

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
	const problem = 'no running container publishes port 55432';

	it('names pg_dump, the file that would go stale, and how to get it', () => {
		const message = pgDumpRefusal({ command: 'up', local: null, problem });
		expect(message).toContain('pg_dump is not on the PATH');
		expect(message).toContain('packages/db/schema.sql');
		expect(message).toContain('no migration was applied');
		expect(message).toContain('`pnpm db:migrate`');
		expect(message).toContain(problem);
		expect(message).toContain('docker compose up -d postgres');
	});

	it('says nothing was rolled back when the rollback is refused', () => {
		const message = pgDumpRefusal({ command: 'rollback', local: null, problem });
		expect(message).toContain('nothing was rolled back');
		expect(message).toContain('packages/db/schema.sql');
		expect(message).toContain('`pnpm db:rollback`');
		expect(message).not.toContain('no migration was applied');
	});

	it('names the version and the path of a pg_dump that is too new', () => {
		const message = pgDumpRefusal({
			command: 'up',
			local: { path: 'C:\\pg\\18\\bin\\pg_dump.exe', version: { major: 18, minor: 6 } },
			problem,
		});
		expect(message).toContain('pg_dump 18.6 at C:\\pg\\18\\bin\\pg_dump.exe is not 17.0 to 17.5');
		expect(message).toContain('\\restrict');
		expect(message).toContain('17.5 or older');
		expect(message).not.toContain('not on the PATH');
	});

	it('says so when a pg_dump answers --version with no version', () => {
		const message = pgDumpRefusal({
			command: 'up',
			local: { path: '/usr/bin/pg_dump', version: null },
			problem,
		});
		expect(message).toContain(
			'the pg_dump at /usr/bin/pg_dump, whose --version answer names no version,',
		);
	});

	it('points the stale-dump fix at the wrapper, which adds search_path and picks the client', () => {
		expect(staleDumpMessage({ rewritten: false, undumped: [], lingering: [] })).toContain(
			'node scripts/db-migrate.mjs dump',
		);
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

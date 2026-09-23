/**
 * The half of `vacuum-catalogs.mjs` that never touches Docker: the psql
 * session it sends, how it reads the session's output back, and the
 * messages it prints.
 *
 * The runner spawns `docker exec` and cannot be imported without a container
 * in front of it, so everything that can be answered from text is answered
 * here, the way `fallow-comparison.test.ts` reaches the comparison behind
 * `fallow.mjs`.
 */

import { describe, expect, it } from 'vitest';
import {
	CATALOGS,
	formatBytes,
	parseSession,
	refusal,
	report,
	sessionFailure,
	sessionSql,
} from '../../../../lib/catalog-vacuum.mjs';

const CLEAN_RUN = [
	'== backends',
	'== before',
	'pg_attribute|78774272',
	'pg_depend|148676608',
	'== after',
	'pg_attribute|1048576',
	'pg_depend|2097152',
	'',
].join('\n');

const REFUSED_RUN = [
	'== backends',
	'320790|172.18.0.3|-|idle',
	'340319|172.18.0.1|-|idle',
	'340320|172.18.0.1|psql|active',
	'',
].join('\n');

describe('sessionSql', () => {
	it('vacuums every catalog in the register and measures the same list', () => {
		const sql = sessionSql();
		for (const catalog of CATALOGS) {
			expect(sql).toContain(`vacuum full pg_catalog.${catalog};`);
		}
		const measured = sql.match(/relname in \(([^)]+)\)/g) ?? [];
		expect(measured).toHaveLength(2);
		for (const list of measured) {
			for (const catalog of CATALOGS) expect(list).toContain(`'${catalog}'`);
		}
	});

	it('quits before the first vacuum when another backend is on the database', () => {
		const sql = sessionSql();
		const quit = sql.indexOf('\\quit');
		const vacuum = sql.indexOf('vacuum full');
		expect(quit).toBeGreaterThan(-1);
		expect(quit).toBeLessThan(vacuum);
		expect(sql).toContain("backend_type = 'client backend'");
		expect(sql).toContain('pid <> pg_backend_pid()');
	});

	it('reads the list it prints and the boolean it quits on off one query', () => {
		// Two queries would let a backend leave between them, so the run vacuums
		// and then reports a refusal off the list it printed first.
		const sql = sessionSql();
		const gsets = sql.split('\n').filter((line) => line.includes('\\gset'));
		expect(gsets).toHaveLength(1);
		expect(gsets[0]).toContain('as busy');
		expect(gsets[0]).toContain('as rows');
		expect(sql).toContain('\\echo :rows');
	});
});

describe('parseSession', () => {
	it('reads the three sections of a run that vacuumed', () => {
		const session = parseSession(CLEAN_RUN);
		expect(session.backends).toEqual([]);
		expect(session.before).toEqual({ pg_attribute: 78774272, pg_depend: 148676608 });
		expect(session.after).toEqual({ pg_attribute: 1048576, pg_depend: 2097152 });
	});

	it('reads the backends of a run that quit, with no sizes', () => {
		const session = parseSession(REFUSED_RUN);
		expect(session.backends).toEqual([
			{ pid: 320790, address: '172.18.0.3', application: '-', state: 'idle' },
			{ pid: 340319, address: '172.18.0.1', application: '-', state: 'idle' },
			{ pid: 340320, address: '172.18.0.1', application: 'psql', state: 'active' },
		]);
		expect(session.before).toBeNull();
		expect(session.after).toBeNull();
	});

	it('refuses output with no section markers rather than reading it as clean', () => {
		expect(() => parseSession('psql: error: connection refused\n')).toThrow(/section/);
	});

	it('refuses a size row it cannot read rather than reporting NaN', () => {
		const tagged = CLEAN_RUN.replace('== after', 'VACUUM\n== after');
		expect(() => parseSession(tagged)).toThrow(/VACUUM/);
	});
});

describe('refusal', () => {
	it('names the lock rule and every backend', () => {
		const message = refusal(parseSession(REFUSED_RUN).backends, 'simmer_mosquito');
		expect(message).toContain('3 other backends');
		expect(message).toContain('access exclusive');
		expect(message).toContain('340320  172.18.0.1  psql  active');
	});

	it('says which connections are the local Electric and which are this machine', () => {
		const message = refusal(parseSession(REFUSED_RUN).backends, 'simmer_mosquito');
		expect(message).toContain('172.18.0.3: inside the compose network');
		expect(message).toContain('docker compose stop electric');
		expect(message).toContain("172.18.0.1: the compose network's gateway");
	});

	it('leaves the Electric hint out when no connection comes from inside the network', () => {
		const message = refusal(
			[{ pid: 1, address: '172.18.0.1', application: 'psql', state: 'active' }],
			'simmer_mosquito',
		);
		expect(message).not.toContain('docker compose stop electric');
	});

	it('reads a socket connection as a session inside the container, not as Electric', () => {
		// A docker exec psql held open is how the issue verifies the refusal, and
		// its client_addr is null.
		const message = refusal(
			[{ pid: 1, address: 'socket', application: 'psql', state: 'active' }],
			'simmer_mosquito',
		);
		expect(message).toContain('socket: a session inside the container');
		expect(message).not.toContain('docker compose stop electric');
	});
});

describe('sessionFailure', () => {
	it('is the refusal when the session quit at the backend check', () => {
		const failure = sessionFailure(parseSession(REFUSED_RUN), 'simmer_mosquito');
		expect(failure).toContain('Refusing to vacuum: 3 other backends');
	});

	it('names the catalogs the session did not measure', () => {
		const failure = sessionFailure(parseSession(CLEAN_RUN), 'simmer_mosquito');
		expect(failure).toContain(`Measured 2 of the ${CATALOGS.length} catalogs`);
		expect(failure).toContain('pg_class');
		expect(failure).not.toContain('pg_depend');
	});

	it('names a catalog measured before the vacuum and not after', () => {
		const rows = CATALOGS.map((name) => `${name}|1024`).join('\n');
		const short = `== backends\n== before\n${rows}\n== after\npg_depend|1024\n`;
		const failure = sessionFailure(parseSession(short), 'simmer_mosquito');
		expect(failure).toContain(`Measured 1 of the ${CATALOGS.length} catalogs`);
		expect(failure).toContain('pg_attribute');
	});

	it('fails a run that found nobody and printed no sizes', () => {
		const failure = sessionFailure(parseSession('== backends\n'), 'simmer_mosquito');
		expect(failure).toContain('printed no sizes');
	});

	it('is null when every catalog was measured twice', () => {
		const rows = CATALOGS.map((name) => `${name}|1024`).join('\n');
		const whole = `== backends\n== before\n${rows}\n== after\n${rows}\n`;
		expect(sessionFailure(parseSession(whole), 'simmer_mosquito')).toBeNull();
	});
});

describe('report', () => {
	it('prints each catalog before and after, and the total reclaimed', () => {
		const session = parseSession(CLEAN_RUN);
		const lines = report(session.before ?? {}, session.after ?? {});
		expect(lines).toContain('pg_depend      141.8 MB  ->     2.0 MB');
		expect(lines).toContain('pg_attribute    75.1 MB  ->     1.0 MB');
		expect(lines).toContain('Reclaimed 213.9 MB across 2 catalogs.');
	});
});

describe('formatBytes', () => {
	it('picks the unit a person would', () => {
		expect(formatBytes(0)).toBe('0 B');
		expect(formatBytes(16384)).toBe('16.0 kB');
		expect(formatBytes(148676608)).toBe('141.8 MB');
		expect(formatBytes(2 ** 31)).toBe('2.0 GB');
	});
});

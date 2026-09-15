import { describe, expect, it } from 'vitest';
import {
	refuseDatabaseWithReplicationSlot,
	refuseLoopbackNameOnWindows,
	type SlotReadable,
} from '../../../test-support/db-integration.js';

function poolReturning(slotNames: readonly string[]): SlotReadable {
	return {
		query: (sql: string) => {
			expect(sql).toContain('pg_replication_slots');
			return Promise.resolve({ rows: slotNames.map((slot_name) => ({ slot_name })) });
		},
	};
}

describe('refuseDatabaseWithReplicationSlot', () => {
	it('allows a database with no slots', async () => {
		await expect(refuseDatabaseWithReplicationSlot(poolReturning([]))).resolves.toBeUndefined();
	});

	it('refuses a database with a slot and names it', async () => {
		await expect(
			refuseDatabaseWithReplicationSlot(poolReturning(['electric_default'])),
		).rejects.toThrow(/electric_default/);
	});

	it('names every slot it found', async () => {
		await expect(refuseDatabaseWithReplicationSlot(poolReturning(['one', 'two']))).rejects.toThrow(
			/\(one, two\)/,
		);
	});

	it('sends the reader to the local container', async () => {
		await expect(refuseDatabaseWithReplicationSlot(poolReturning(['slot']))).rejects.toThrow(
			/docker-compose\.yml/,
		);
	});

	// The compose file runs Electric against the same `postgres` service, so a
	// refusal that only named the container would send the reader back to the
	// database that has the slot. The message is the only place anyone hits this.
	it('carries the drop statement for every slot it found', async () => {
		await expect(
			refuseDatabaseWithReplicationSlot(poolReturning(['electric_slot_default', 'other'])),
		).rejects.toThrow(
			/pg_drop_replication_slot\('electric_slot_default'\);.*pg_drop_replication_slot\('other'\);/s,
		);
	});

	it('says what dropping the slot costs', async () => {
		await expect(refuseDatabaseWithReplicationSlot(poolReturning(['slot']))).rejects.toThrow(
			/re-snapshot/,
		);
	});

	it('offers the remedy for the local container only, and not for a remote database', async () => {
		const failure = await refuseDatabaseWithReplicationSlot(poolReturning(['slot'])).then(
			(): Error => {
				throw new Error('The guard let a database with a slot through.');
			},
			(error: unknown) => error as Error,
		);

		const [remedy, remote] = failure.message.split('\n').slice(1);
		expect(remedy).toContain('docker-compose.yml');
		expect(remedy).toContain('pg_drop_replication_slot');
		expect(remote).toContain('staging');
		expect(remote).toContain('leave the slot alone');
		expect(remote).not.toContain('pg_drop_replication_slot');
	});
});

describe('refuseLoopbackNameOnWindows', () => {
	const compose = 'postgres://postgres:postgres@localhost:55432/simmer_mosquito';

	it('refuses localhost on Windows and names the mechanism', () => {
		expect(() => refuseLoopbackNameOnWindows(compose, 'win32')).toThrow(/IPv6 port proxy/);
	});

	it('refuses an explicit ::1 on Windows', () => {
		expect(() =>
			refuseLoopbackNameOnWindows(
				'postgres://postgres:postgres@[::1]:55432/simmer_mosquito',
				'win32',
			),
		).toThrow(/\[::1\]/);
	});

	// The message is the only place anyone meets this, so it has to carry the
	// URL to type rather than a description of it.
	it('hands back the same URL over 127.0.0.1', () => {
		expect(() => refuseLoopbackNameOnWindows(compose, 'win32')).toThrow(
			'postgres://postgres:postgres@127.0.0.1:55432/simmer_mosquito',
		);
	});

	it('allows 127.0.0.1 on Windows', () => {
		expect(() =>
			refuseLoopbackNameOnWindows(
				'postgres://postgres:postgres@127.0.0.1:55432/simmer_mosquito',
				'win32',
			),
		).not.toThrow();
	});

	it('allows a host that is not loopback on Windows', () => {
		expect(() =>
			refuseLoopbackNameOnWindows('postgres://postgres:postgres@db.internal:5432/simmer', 'win32'),
		).not.toThrow();
	});

	// CI reaches its service container over localhost on Linux, where the proxy
	// this guards against does not exist.
	it('allows localhost anywhere but Windows', () => {
		expect(() => refuseLoopbackNameOnWindows(compose, 'linux')).not.toThrow();
		expect(() => refuseLoopbackNameOnWindows(compose, 'darwin')).not.toThrow();
	});
});

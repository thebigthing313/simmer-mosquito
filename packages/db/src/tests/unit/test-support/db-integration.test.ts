import { describe, expect, it } from 'vitest';
import {
	refuseDatabaseWithReplicationSlot,
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

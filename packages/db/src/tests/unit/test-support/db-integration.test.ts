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
});

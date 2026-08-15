import { describe, expect, it } from 'vitest';
import {
	type CollectionMutation,
	createCollectionMutator,
	type MutableCollection,
	type MutationTransaction,
} from '../../../../collections/functions/mutate-collection.js';

interface TestRow {
	readonly id: string;
	readonly name: string | null;
	readonly is_active: boolean;
}

type Vocabulary = 'test.create' | 'test.retire' | 'test.rename' | 'test.recordAcrossTables';
type MultiTable = 'test.recordAcrossTables';

const mutate = createCollectionMutator<Exclude<Vocabulary, MultiTable>>();

interface RecordedCall {
	readonly method: 'insert' | 'update' | 'delete';
	readonly key?: string;
	readonly row?: TestRow;
	readonly metadata: Record<string, unknown> | undefined;
	readonly draftAfter?: Partial<TestRow>;
}

/**
 * A collection that records rather than syncs.
 *
 * Possible because the wrapper asks for a structural type rather than the real
 * `Collection`, so what it does to the three methods can be read directly.
 */
function recordingCollection(): {
	readonly collection: MutableCollection<TestRow>;
	readonly calls: RecordedCall[];
} {
	const calls: RecordedCall[] = [];
	const transaction: MutationTransaction = { isPersisted: { promise: Promise.resolve() } };

	return {
		calls,
		collection: {
			insert: (row, config) => {
				calls.push({ method: 'insert', row, metadata: config?.metadata });
				return transaction;
			},
			update: (key, config, draft) => {
				const draftRow: Partial<TestRow> = {};
				draft(draftRow as TestRow);
				calls.push({ method: 'update', key, metadata: config.metadata, draftAfter: draftRow });
				return transaction;
			},
			delete: (key, config) => {
				calls.push({ method: 'delete', key, metadata: config?.metadata });
				return transaction;
			},
		},
	};
}

describe('mutateCollection', () => {
	it('names the command on every write', () => {
		const { collection, calls } = recordingCollection();

		mutate(collection, {
			operation: 'insert',
			intent: 'test.create',
			row: { id: 'row-1', name: 'A', is_active: true },
		});
		mutate(collection, {
			operation: 'update',
			intent: 'test.retire',
			key: 'row-1',
			changes: { is_active: false },
		});
		mutate(collection, { operation: 'delete', intent: 'test.retire', key: 'row-1' });

		expect(calls.map((call) => call.metadata?.intents)).toEqual([
			['test.create'],
			['test.retire'],
			['test.retire'],
		]);
	});

	it('takes several commands for one row, as the list they are', () => {
		// One save can mean more than one command against the same row. Writing them
		// as two mutations loses one: TanStack DB merges two updates to a key and
		// keeps only the later `metadata`.
		const { collection, calls } = recordingCollection();

		mutate(collection, {
			operation: 'update',
			intent: ['test.retire', 'test.rename'],
			key: 'row-1',
			changes: { is_active: false, name: 'B' },
		});

		expect(calls[0]?.metadata?.intents).toEqual(['test.retire', 'test.rename']);
	});

	it('applies the changes to the draft so the library computes the diff', () => {
		const { collection, calls } = recordingCollection();

		mutate(collection, {
			operation: 'update',
			intent: 'test.retire',
			key: 'row-1',
			changes: { is_active: false, name: null },
		});

		expect(calls[0]?.draftAfter).toEqual({ is_active: false, name: null });
	});

	it('omits the location instruction rather than sending it undefined', () => {
		// A `locationSource: undefined` would spread into the body as a key, and the
		// server reads presence — an absent instruction and an empty one are not the
		// same request.
		const { collection, calls } = recordingCollection();

		mutate(collection, {
			operation: 'insert',
			intent: 'test.create',
			row: { id: 'row-1', name: 'A', is_active: true },
		});

		expect(calls[0]?.metadata).not.toHaveProperty('locationSource');
	});

	it('carries the location instruction when one was drawn', () => {
		const { collection, calls } = recordingCollection();
		const locationSource = { kind: 'geometry', geometry: { type: 'Point', coordinates: [0, 0] } };

		mutate(collection, {
			operation: 'insert',
			intent: 'test.create',
			row: { id: 'row-1', name: 'A', is_active: true },
			locationSource,
		});

		expect(calls[0]?.metadata?.locationSource).toBe(locationSource);
	});

	it('never sends a location instruction on a delete', () => {
		// The delete branch returns before the location is read, so the shape of the
		// mutation type is what keeps the two from being combined.
		const deletion: CollectionMutation<TestRow, 'test.retire'> = {
			operation: 'delete',
			intent: 'test.retire',
			key: 'row-1',
		};

		expect(deletion).not.toHaveProperty('locationSource');
	});

	it('refuses a name outside the vocabulary, and a multi-table command', () => {
		const { collection } = recordingCollection();

		// @ts-expect-error — not a command in the vocabulary.
		mutate(collection, { operation: 'delete', intent: 'test.notACommand', key: 'row-1' });

		// @ts-expect-error — a real command, but excluded as multi-table.
		mutate(collection, { operation: 'delete', intent: 'test.recordAcrossTables', key: 'row-1' });

		mutate(collection, {
			operation: 'delete',
			// @ts-expect-error — the vocabulary constrains a list the same as one name.
			intent: ['test.retire', 'test.notACommand'],
			key: 'row-1',
		});

		mutate(collection, {
			operation: 'update',
			intent: 'test.retire',
			key: 'row-1',
			// @ts-expect-error — changes must be fields of the row.
			changes: { is_actve: false },
		});

		expect(true).toBe(true);
	});
});

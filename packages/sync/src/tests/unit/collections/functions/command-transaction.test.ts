import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	sendCommandTransaction,
	type TransactionWrite,
} from '../../../../collections/functions/command-transaction.js';

const SERVER = 'https://api.test';

/** Every call the stubbed API received, in order. */
interface SentRequest {
	readonly url: string;
	readonly method: string;
	readonly body: Record<string, unknown>;
}

function stubApi(txid = 4242): { readonly sent: SentRequest[] } {
	const sent: SentRequest[] = [];

	vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
		sent.push({
			url,
			method: init.method ?? 'GET',
			body: JSON.parse(String(init.body)) as Record<string, unknown>,
		});
		return Promise.resolve(new Response(JSON.stringify({ txid }), { status: 200 }));
	});

	return { sent };
}

/**
 * A collection, with the two things a transaction reads off it that a single-row
 * write never has to: whether anyone is watching, and how to wait for a txid.
 */
function collection(input: {
	readonly id: string;
	readonly subscriberCount?: number;
	readonly writable?: boolean;
	readonly awaited?: number[];
}): TransactionWrite['collection'] {
	const handlers = { onInsert: () => {}, onUpdate: () => {}, onDelete: () => {} };
	const awaited = input.awaited ?? [];

	return {
		id: input.id,
		config: input.writable === false ? {} : handlers,
		subscriberCount: input.subscriberCount ?? 1,
		utils: {
			awaitTxId: (txId: number) => {
				awaited.push(txId);
				return Promise.resolve(true);
			},
		},
	};
}

function write(
	collectionValue: TransactionWrite['collection'],
	type: TransactionWrite['type'] = 'insert',
): TransactionWrite {
	return { type, collection: collectionValue };
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('sendCommandTransaction', () => {
	it('sends one request for the whole command, not one per mutation', () => {
		// The reason the multi-row path exists at all: a create carrying four batches
		// is five optimistic rows and one command, and splitting it would let the
		// parent commit while a child is refused.
		const { sent } = stubApi();
		const applications = collection({ id: 'applications' });
		const batches = collection({ id: 'application_batches' });

		return sendCommandTransaction({
			mutations: [
				write(applications),
				write(batches),
				write(batches),
				write(batches),
				write(batches),
			],
			request: {
				table: 'applications',
				method: 'POST',
				body: { id: 'application-1', application_batches: [{ id: 'link-1' }] },
			},
			intent: 'controlOperations.recordChemicalApplication',
			serverUrl: SERVER,
		}).then(() => {
			expect(sent).toHaveLength(1);
			expect(sent[0]?.url).toBe('https://api.test/commands/applications');
			expect(sent[0]?.method).toBe('POST');
			expect(sent[0]?.body).toEqual({
				id: 'application-1',
				application_batches: [{ id: 'link-1' }],
				intents: ['controlOperations.recordChemicalApplication'],
			});
		});
	});

	it('posts to the parent table, whichever collections the rows belong to', async () => {
		// The route follows the command, not the mutations — a create carrying
		// children is one command against the parent's endpoint.
		const { sent } = stubApi();

		await sendCommandTransaction({
			mutations: [write(collection({ id: 'application_batches' }))],
			request: { table: 'applications', method: 'POST', body: { id: 'application-1' } },
			intent: 'controlOperations.recordChemicalApplication',
			serverUrl: SERVER,
		});

		expect(sent[0]?.url).toBe('https://api.test/commands/applications');
	});

	it('puts the row in the path on the verbs that have one', async () => {
		const { sent } = stubApi();

		await sendCommandTransaction({
			mutations: [write(collection({ id: 'assignment_items' }), 'update')],
			request: {
				table: 'assignments',
				method: 'PATCH',
				key: 'assignment-1',
				body: { item_ids: ['item-2', 'item-1'] },
			},
			intent: 'fieldWork.moveAssignmentItems',
			serverUrl: SERVER,
		});

		expect(sent[0]?.url).toBe('https://api.test/commands/assignments/assignment-1');
		expect(sent[0]?.method).toBe('PATCH');
	});

	it('refuses a write to a collection the client declared read-only', async () => {
		// The guard TanStack DB skips: its own check is `!ambientTransaction &&
		// !config.onInsert`, so a transaction is the one path where a `mutations:
		// false` collection would otherwise accept a write.
		const { sent } = stubApi();

		await expect(
			sendCommandTransaction({
				mutations: [
					write(collection({ id: 'applications' })),
					write(collection({ id: 'application_batches', writable: false })),
				],
				request: { table: 'applications', method: 'POST', body: { id: 'application-1' } },
				intent: 'controlOperations.recordChemicalApplication',
				serverUrl: SERVER,
			}),
		).rejects.toThrow('This client cannot insert application_batches');

		// Refused before the request, so nothing was written and there is nothing to
		// undo on the server.
		expect(sent).toHaveLength(0);
	});

	it('holds every collection the command touched until the write streams back', async () => {
		// One txid for the whole command, because the server committed it in one
		// Postgres transaction — and each collection has its own stream to see it on.
		stubApi(77);
		const applicationsAwaited: number[] = [];
		const batchesAwaited: number[] = [];

		await sendCommandTransaction({
			mutations: [
				write(collection({ id: 'applications', awaited: applicationsAwaited })),
				write(collection({ id: 'application_batches', awaited: batchesAwaited })),
			],
			request: { table: 'applications', method: 'POST', body: { id: 'application-1' } },
			intent: 'controlOperations.recordChemicalApplication',
			serverUrl: SERVER,
		});

		expect(applicationsAwaited).toEqual([77]);
		expect(batchesAwaited).toEqual([77]);
	});

	it('waits once per collection rather than once per row', async () => {
		stubApi(77);
		const awaited: number[] = [];
		const batches = collection({ id: 'application_batches', awaited });

		await sendCommandTransaction({
			mutations: [write(batches), write(batches), write(batches)],
			request: { table: 'applications', method: 'POST', body: { id: 'application-1' } },
			intent: 'controlOperations.recordChemicalApplication',
			serverUrl: SERVER,
		});

		expect(awaited).toEqual([77]);
	});

	it('does not wait on a collection nothing is watching', async () => {
		// Not an optimization. A collection with no subscribers has a paused stream
		// and no live query to snapshot, so the wait never resolves — it ends in a
		// timeout on a write that committed. A transaction routinely spans a warm
		// collection and a cold one, which is why this is per collection.
		stubApi();
		const warmAwaited: number[] = [];
		const coldAwaited: number[] = [];

		await sendCommandTransaction({
			mutations: [
				write(collection({ id: 'applications', subscriberCount: 0, awaited: coldAwaited })),
				write(collection({ id: 'application_batches', awaited: warmAwaited })),
			],
			request: { table: 'applications', method: 'POST', body: { id: 'application-1' } },
			intent: 'controlOperations.recordChemicalApplication',
			serverUrl: SERVER,
		});

		expect(coldAwaited).toEqual([]);
		expect(warmAwaited).toHaveLength(1);
	});

	it('does not wait at all when the server refused', async () => {
		vi.stubGlobal('fetch', () =>
			Promise.resolve(
				new Response(JSON.stringify({ reason: 'insecticide_batch_not_found' }), { status: 404 }),
			),
		);
		const awaited: number[] = [];

		await expect(
			sendCommandTransaction({
				mutations: [write(collection({ id: 'applications', awaited }))],
				request: { table: 'applications', method: 'POST', body: { id: 'application-1' } },
				intent: 'controlOperations.recordChemicalApplication',
				serverUrl: SERVER,
			}),
		).rejects.toThrow('insecticide_batch_not_found');

		expect(awaited).toEqual([]);
	});
});

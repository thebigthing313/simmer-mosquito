import type { InsertMutationFnParams } from '@tanstack/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMutationHandlers } from '../../../../collections/functions/mutation-handlers.js';
import { setSessionFetcher } from '../../../../collections/functions/session-fetch.js';
import { globalTransport } from './global-transport.js';

interface Row {
	readonly id: string;
	readonly habitat_name: string;
}

const SERVER = 'https://api.test';

/** The API answers every write with this txid. */
function stubApi(txid: number): void {
	vi.stubGlobal('fetch', () =>
		Promise.resolve(new Response(JSON.stringify({ txid }), { status: 200 })),
	);
}

/**
 * The parts of a handler's params the insert path reads: the collection the
 * rows belong to, and one pending insert on it.
 */
function insertOn(subscriberCount: number) {
	const waits: unknown[][] = [];
	const collection = {
		id: 'habitats',
		config: { onInsert: () => {}, onUpdate: () => {}, onDelete: () => {} },
		subscriberCount,
		utils: {
			awaitTxId: (...args: unknown[]) => {
				waits.push(args);
				return Promise.resolve(true);
			},
		},
	};
	const params = {
		collection,
		transaction: {
			mutations: [
				{
					type: 'insert',
					collection,
					modified: { id: 'habitat-1', habitat_name: 'Ditch' },
					changes: {},
					key: 'habitat-1',
					metadata: { intents: ['larvalSurveillance.createHabitat'] },
				},
			],
		},
	} as unknown as InsertMutationFnParams<Row>;
	return { params, waits };
}

beforeEach(() => {
	setSessionFetcher(globalTransport);
});

afterEach(() => {
	setSessionFetcher(null);
	vi.unstubAllGlobals();
});

describe('createMutationHandlers', () => {
	it('holds an insert open until its txid streams back', async () => {
		stubApi(4242);
		const { params, waits } = insertOn(1);

		await createMutationHandlers<Row>({ serverUrl: SERVER }).onInsert(params);

		expect(waits).toEqual([[4242]]);
	});

	it('returns nothing for the adapter to read, since it waited itself', async () => {
		// Returning `{ txid }` is the deprecated form; the adapter would wait a
		// second time and warn.
		stubApi(4242);
		const { params } = insertOn(1);

		await expect(
			createMutationHandlers<Row>({ serverUrl: SERVER }).onInsert(params),
		).resolves.toBeUndefined();
	});

	it('does not wait when nothing is watching the collection', async () => {
		stubApi(4242);
		const { params, waits } = insertOn(0);

		await createMutationHandlers<Row>({ serverUrl: SERVER }).onInsert(params);

		expect(waits).toEqual([]);
	});
});

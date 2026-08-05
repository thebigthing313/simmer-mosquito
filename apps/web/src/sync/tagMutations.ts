import { createRowPayloadMapper, type TagRow } from '@simmer-mosquito/sync';
import { commandErrorFrom } from './command-error';

const mapTagCreatePayload = createRowPayloadMapper<TagRow>([
	'id',
	'tagName',
	'description',
	'color',
] as const);
const mapTagUpdatePayload = createRowPayloadMapper<TagRow>([
	'tagName',
	'description',
	'color',
] as const);

export function createTagMutationHandlers(options: { readonly serverUrl: string }) {
	return {
		onInsert: async ({ transaction }: CollectionMutationHandlerInput<TagRow>) => {
			const txids = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const result = await writeTag(
						`${options.serverUrl}/foundation/tags`,
						'POST',
						toTagCreatePayload(mutation.modified),
					);
					return result.txid;
				}),
			);

			return { txid: txids };
		},
		onUpdate: async ({ transaction }: CollectionMutationHandlerInput<TagRow>) => {
			const txids = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const row = mutation.modified;
					const result = await writeTag(`${options.serverUrl}/foundation/tags/${row.id}`, 'PATCH', {
						...toTagUpdatePayload(row),
						isActive: row.isActive,
					});
					return result.txid;
				}),
			);

			return { txid: txids };
		},
		onDelete: async ({ transaction }: CollectionMutationHandlerInput<TagRow>) => {
			const txids = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					if (mutation.original.id === undefined) {
						throw new Error('Unable to delete tag without an id.');
					}
					const result = await writeTag(
						`${options.serverUrl}/foundation/tags/${mutation.original.id}`,
						'DELETE',
						undefined,
					);
					return result.txid;
				}),
			);

			return { txid: txids };
		},
	};
}

interface CollectionMutationHandlerInput<TRow> {
	readonly transaction: {
		readonly mutations: readonly {
			readonly original: Partial<TRow>;
			readonly modified: TRow;
		}[];
	};
}

interface TagMutationResult {
	readonly txid: number;
}

function toTagCreatePayload(row: TagRow) {
	return mapTagCreatePayload(row);
}

function toTagUpdatePayload(row: TagRow) {
	return mapTagUpdatePayload(row);
}

async function writeTag(
	url: string,
	method: 'POST' | 'PATCH' | 'DELETE',
	body: unknown,
): Promise<TagMutationResult> {
	const response = await fetch(url, {
		method,
		credentials: 'include',
		headers: {
			accept: 'application/json',
			...(body === undefined ? {} : { 'content-type': 'application/json' }),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const result = (await response.json()) as
		| TagMutationResult
		| { readonly error: string; readonly reason?: string; readonly message?: string };

	if (!response.ok || !('txid' in result)) {
		throw commandErrorFrom(response, result, 'Unable to save tag.');
	}

	return result;
}

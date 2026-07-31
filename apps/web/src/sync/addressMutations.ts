import { type AddressRow, createRowPayloadMapper } from '@simmer-mosquito/sync';
import { isNoOpUpdate } from './change-set';

const mapAddressPayload = createRowPayloadMapper<AddressRow>([
	'id',
	'displayName',
	'country',
	'addressLine1',
	'addressLine2',
	'locality',
	'region',
	'postalCode',
	'geocoderResponse',
] as const);

/** Detail fields the server PATCH accepts (country is fixed on create). */
const editableDetailKeys = [
	'displayName',
	'addressLine1',
	'addressLine2',
	'locality',
	'region',
	'postalCode',
	'geocoderResponse',
] as const satisfies readonly (keyof AddressRow)[];

export function createAddressMutationHandlers(options: { readonly serverUrl: string }) {
	const endpoint = `${options.serverUrl}/foundation/addresses`;
	return {
		onInsert: async ({ transaction }: InsertHandlerInput<AddressRow>) => {
			await Promise.all(
				transaction.mutations.map(async (mutation) => {
					await writeAddress(endpoint, 'POST', toAddressPayload(mutation.modified));
				}),
			);
		},
		onUpdate: async ({ transaction }: UpdateHandlerInput<AddressRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const body = toAddressUpdatePayload(mutation.original, mutation.modified);
					if (isNoOpUpdate(body)) {
						return null;
					}
					const result = await writeAddress(`${endpoint}/${mutation.modified.id}`, 'PATCH', body);
					return result.txid;
				}),
			);
			return { txid: txid.filter((value) => value !== null) };
		},
		onDelete: async ({ transaction }: DeleteHandlerInput<AddressRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const id = mutation.original.id;
					if (id === undefined) {
						throw new Error('Unable to delete an address without an id.');
					}
					const result = await writeAddress(`${endpoint}/${id}`, 'DELETE', undefined);
					return result.txid;
				}),
			);
			return { txid };
		},
	};
}

interface InsertHandlerInput<TRow> {
	readonly transaction: {
		readonly mutations: readonly {
			readonly modified: TRow;
		}[];
	};
}

interface UpdateHandlerInput<TRow> {
	readonly transaction: {
		readonly mutations: readonly {
			readonly original: Partial<TRow>;
			readonly modified: TRow;
		}[];
	};
}

interface DeleteHandlerInput<TRow> {
	readonly transaction: {
		readonly mutations: readonly {
			readonly original: Partial<TRow>;
		}[];
	};
}

interface AddressMutationResult {
	readonly txid: number;
}

function toAddressPayload(row: AddressRow) {
	if (row.geojson === undefined) {
		throw new Error('Address geometry is required.');
	}

	return {
		...mapAddressPayload(row),
		geojson: row.geojson,
	};
}

function toAddressUpdatePayload(original: Partial<AddressRow>, modified: AddressRow) {
	const body: Record<string, unknown> = {};
	for (const key of editableDetailKeys) {
		if (!valuesEqual(original[key], modified[key])) {
			body[key] = modified[key] ?? null;
		}
	}
	// The drawable geojson is not part of the synced row, so a moved point shows up
	// as a changed geojson on the optimistic draft; forward it only when it actually
	// changed.
	if (modified.geojson !== undefined && !valuesEqual(original.geojson, modified.geojson)) {
		body.geojson = modified.geojson;
	}
	return body;
}

function valuesEqual(a: unknown, b: unknown): boolean {
	if (a === b) {
		return true;
	}
	if (typeof a === 'object' || typeof b === 'object') {
		return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
	}
	return false;
}

async function writeAddress(
	url: string,
	method: 'POST' | 'PATCH' | 'DELETE',
	body: unknown,
): Promise<AddressMutationResult> {
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
		| AddressMutationResult
		| { readonly error: string; readonly reason?: string; readonly message?: string };

	if (!response.ok || !('txid' in result)) {
		throw new Error(
			'reason' in result && typeof result.reason === 'string'
				? result.reason
				: 'message' in result && typeof result.message === 'string'
					? result.message
					: 'Unable to save address.',
		);
	}

	return result;
}

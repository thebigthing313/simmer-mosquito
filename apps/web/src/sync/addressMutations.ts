import { createRowPayloadMapper, type AddressRow } from '@simmer-mosquito/sync';

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

export function createAddressMutationHandlers(options: { readonly serverUrl: string }) {
	return {
		onInsert: async ({ transaction }: CollectionMutationHandlerInput<AddressRow>) => {
			await Promise.all(
				transaction.mutations.map(async (mutation) => {
					await writeAddress(
						`${options.serverUrl}/foundation/addresses`,
						toAddressPayload(mutation.modified),
					);
				}),
			);
		},
	};
}

interface CollectionMutationHandlerInput<TRow> {
	readonly transaction: {
		readonly mutations: readonly {
			readonly modified: TRow;
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

async function writeAddress(url: string, body: unknown): Promise<AddressMutationResult> {
	const response = await fetch(url, {
		method: 'POST',
		credentials: 'include',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
		},
		body: JSON.stringify(body),
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

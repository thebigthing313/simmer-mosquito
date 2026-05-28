import type { AddressRow } from '@simmer-mosquito/sync';

export function createAddressMutationHandlers(options: { readonly serverUrl: string }) {
	return {
		onInsert: async ({ transaction }: CollectionMutationHandlerInput<AddressRow>) => {
			const txids = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const result = await writeAddress(
						`${options.serverUrl}/foundation/addresses`,
						toAddressPayload(mutation.modified),
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
		id: row.id,
		displayName: row.displayName,
		country: row.country,
		addressLine1: row.addressLine1,
		addressLine2: row.addressLine2,
		locality: row.locality,
		region: row.region,
		postalCode: row.postalCode,
		geocoderResponse: row.geocoderResponse,
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

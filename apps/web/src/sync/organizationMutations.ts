import type { OrganizationRow } from '@simmer-mosquito/sync';

export function createOrganizationMutationHandlers(options: { readonly serverUrl: string }) {
	return {
		onUpdate: async ({ transaction }: CollectionMutationHandlerInput<OrganizationRow>) => {
			const txids = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const result = await writeOrganization(
						`${options.serverUrl}/organization/current`,
						toOrganizationPayload(mutation.modified, mutation.original),
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

interface OrganizationMutationResult {
	readonly txid: number;
}

function toOrganizationPayload(row: OrganizationRow, original: Partial<OrganizationRow>) {
	return {
		name: row.name,
		mainContactEmail: row.mainContactEmail,
		phoneNumber: row.phoneNumber,
		mailingCountry: row.mailingCountry,
		mailingAddressLine1: row.mailingAddressLine1,
		mailingAddressLine2: row.mailingAddressLine2,
		mailingLocality: row.mailingLocality,
		mailingRegion: row.mailingRegion,
		mailingPostalCode: row.mailingPostalCode,
		...(row.settings === original.settings ? {} : { settings: row.settings }),
		expectedUpdatedAt: original.updatedAt ?? null,
	};
}

async function writeOrganization(url: string, body: unknown): Promise<OrganizationMutationResult> {
	const response = await fetch(url, {
		method: 'PATCH',
		credentials: 'include',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
		},
		body: JSON.stringify(body),
	});
	const result = (await response.json()) as
		| OrganizationMutationResult
		| { readonly error: string; readonly reason?: string; readonly message?: string };

	if (!response.ok || !('txid' in result)) {
		throw new Error(
			'reason' in result && typeof result.reason === 'string'
				? result.reason
				: 'message' in result && typeof result.message === 'string'
					? result.message
					: 'Unable to save organization details.',
		);
	}

	return result;
}

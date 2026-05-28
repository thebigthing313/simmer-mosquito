import { createRowPayloadMapper } from '@simmer-mosquito/sync';

interface OrgLookupMutationRow {
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
	readonly customSchema?: unknown | null;
	readonly actionThreshold?: number | null;
	readonly isActive: boolean;
}

const mapOrgLookupPayload = createRowPayloadMapper<OrgLookupMutationRow>(
	['id', 'name', 'description'] as const,
);

export function createOrgLookupMutationHandlers<TRow extends OrgLookupMutationRow>(options: {
	readonly serverUrl: string;
	readonly endpointPath: string;
	readonly fallbackName: string;
}) {
	return {
		onInsert: async ({ transaction }: CollectionMutationHandlerInput<TRow>) => {
			const txids = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const result = await writeOrgLookup(
						`${options.serverUrl}${options.endpointPath}`,
						'POST',
						toOrgLookupPayload(mutation.modified),
						options.fallbackName,
					);
					return result.txid;
				}),
			);

			return { txid: txids };
		},
		onUpdate: async ({ transaction }: CollectionMutationHandlerInput<TRow>) => {
			const txids = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const row = mutation.modified;
					const result = await writeOrgLookup(
						`${options.serverUrl}${options.endpointPath}/${row.id}`,
						'PATCH',
						{
							...toOrgLookupPayload(row),
							isActive: row.isActive,
						},
						options.fallbackName,
					);
					return result.txid;
				}),
			);

			return { txid: txids };
		},
		onDelete: async ({ transaction }: CollectionMutationHandlerInput<TRow>) => {
			const txids = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					if (mutation.original.id === undefined) {
						throw new Error(`Unable to delete ${options.fallbackName} without an id.`);
					}
					const result = await writeOrgLookup(
						`${options.serverUrl}${options.endpointPath}/${mutation.original.id}`,
						'DELETE',
						undefined,
						options.fallbackName,
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

interface OrgLookupMutationResult {
	readonly txid: number;
}

function toOrgLookupPayload(row: OrgLookupMutationRow) {
	return {
		...mapOrgLookupPayload(row),
		...(row.customSchema === undefined ? {} : { customSchema: row.customSchema }),
		...(row.actionThreshold === undefined ? {} : { actionThreshold: row.actionThreshold }),
	};
}

async function writeOrgLookup(
	url: string,
	method: 'POST' | 'PATCH' | 'DELETE',
	body: unknown,
	fallbackName: string,
): Promise<OrgLookupMutationResult> {
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
		| OrgLookupMutationResult
		| { readonly error: string; readonly reason?: string; readonly message?: string };

	if (!response.ok || !('txid' in result)) {
		throw new Error(
			'reason' in result && typeof result.reason === 'string'
				? result.reason
				: 'message' in result && typeof result.message === 'string'
					? result.message
					: `Unable to save ${fallbackName}.`,
		);
	}

	return result;
}

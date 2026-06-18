import { createRowPayloadMapper } from '@simmer-mosquito/sync';

interface ControlMethodMutationRow {
	readonly id: string;
	readonly name: string;
	readonly customSchema?: unknown | null;
	readonly isActive: boolean;
}

const mapControlMethodPayload = createRowPayloadMapper<ControlMethodMutationRow>([
	'id',
	'name',
	'customSchema',
] as const);

export function createControlMethodMutationHandlers<
	TRow extends ControlMethodMutationRow,
>(options: {
	readonly serverUrl: string;
	readonly endpointPath: string;
	readonly fallbackName: string;
}) {
	return {
		onInsert: async ({ transaction }: CollectionMutationHandlerInput<TRow>) => {
			const txids = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const result = await writeControlMethod(
						`${options.serverUrl}${options.endpointPath}`,
						'POST',
						toControlMethodPayload(mutation.modified),
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
					const result = await writeControlMethod(
						`${options.serverUrl}${options.endpointPath}/${row.id}`,
						'PATCH',
						{
							...toControlMethodPayload(row),
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
					const result = await writeControlMethod(
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

interface ControlMethodMutationResult {
	readonly txid: number;
}

function toControlMethodPayload(row: ControlMethodMutationRow) {
	return {
		...mapControlMethodPayload(row),
		customSchema: row.customSchema ?? null,
	};
}

async function writeControlMethod(
	url: string,
	method: 'POST' | 'PATCH' | 'DELETE',
	body: unknown,
	fallbackName: string,
): Promise<ControlMethodMutationResult> {
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
		| ControlMethodMutationResult
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

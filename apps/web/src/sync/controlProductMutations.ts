import { createRowPayloadMapper } from '@simmer-mosquito/sync';
import { commandErrorFrom, readResponseBody } from './command-error';

interface InsecticideMutationRow {
	readonly id: string;
	readonly tradeName: string;
	readonly activeIngredient: string;
	readonly isActive: boolean;
	readonly type: string;
	readonly registrationNumber: string;
	readonly defaultUnitId: string;
	readonly labelUrl: string | null;
	readonly msdsUrl: string | null;
	readonly shorthand: string | null;
	readonly metadata?: unknown | null;
}

interface InsecticideBatchMutationRow {
	readonly id: string;
	readonly organizationId: string;
	readonly insecticideId: string;
	readonly batchName: string;
	readonly isActive: boolean;
}

const mapInsecticidePayload = createRowPayloadMapper<InsecticideMutationRow>([
	'id',
	'tradeName',
	'activeIngredient',
	'type',
	'registrationNumber',
	'defaultUnitId',
	'labelUrl',
	'msdsUrl',
	'shorthand',
] as const);
const mapInsecticideBatchPayload = createRowPayloadMapper<InsecticideBatchMutationRow>([
	'id',
	'insecticideId',
	'batchName',
] as const);

export function createInsecticideMutationHandlers<TRow extends InsecticideMutationRow>(options: {
	readonly serverUrl: string;
}) {
	return createControlProductMutationHandlers<TRow>({
		serverUrl: options.serverUrl,
		endpointPath: '/control-products/insecticides',
		fallbackName: 'insecticide',
		toPayload: (row) => ({
			...mapInsecticidePayload(row),
			metadata: row.metadata ?? null,
		}),
	});
}

export function createInsecticideBatchMutationHandlers<
	TRow extends InsecticideBatchMutationRow,
>(options: { readonly serverUrl: string }) {
	return createControlProductMutationHandlers<TRow>({
		serverUrl: options.serverUrl,
		endpointPath: '/control-products/insecticide-batches',
		fallbackName: 'insecticide batch',
		toPayload: (row) => mapInsecticideBatchPayload(row),
	});
}

function createControlProductMutationHandlers<
	TRow extends { readonly id: string; readonly isActive: boolean },
>(options: {
	readonly serverUrl: string;
	readonly endpointPath: string;
	readonly fallbackName: string;
	readonly toPayload: (row: TRow) => Record<string, unknown>;
}) {
	return {
		onInsert: async ({ transaction }: CollectionMutationHandlerInput<TRow>) => {
			await Promise.all(
				transaction.mutations.map(async (mutation) => {
					await writeControlProduct(
						`${options.serverUrl}${options.endpointPath}`,
						'POST',
						options.toPayload(mutation.modified),
						options.fallbackName,
					);
				}),
			);
		},
		onUpdate: async ({ transaction }: CollectionMutationHandlerInput<TRow>) => {
			await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const row = mutation.modified;
					await writeControlProduct(
						`${options.serverUrl}${options.endpointPath}/${row.id}`,
						'PATCH',
						{
							...options.toPayload(row),
							isActive: row.isActive,
						},
						options.fallbackName,
					);
				}),
			);
		},
		onDelete: async ({ transaction }: CollectionMutationHandlerInput<TRow>) => {
			await Promise.all(
				transaction.mutations.map(async (mutation) => {
					if (mutation.original.id === undefined) {
						throw new Error(`Unable to delete ${options.fallbackName} without an id.`);
					}
					await writeControlProduct(
						`${options.serverUrl}${options.endpointPath}/${mutation.original.id}`,
						'DELETE',
						undefined,
						options.fallbackName,
					);
				}),
			);
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

interface ControlProductMutationResult {
	readonly txid: number;
}

async function writeControlProduct(
	url: string,
	method: 'POST' | 'PATCH' | 'DELETE',
	body: unknown,
	fallbackName: string,
): Promise<ControlProductMutationResult> {
	const response = await fetch(url, {
		method,
		credentials: 'include',
		headers: {
			accept: 'application/json',
			...(body === undefined ? {} : { 'content-type': 'application/json' }),
		},
		...(body === undefined ? {} : { body: JSON.stringify(body) }),
	});
	const result = (await readResponseBody(response)) as
		| ControlProductMutationResult
		| { readonly error: string; readonly reason?: string; readonly message?: string };

	if (!response.ok || !('txid' in result)) {
		throw commandErrorFrom(response, result, `Unable to save ${fallbackName}.`);
	}

	return result;
}

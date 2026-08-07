import { createRowPayloadMapper } from '@simmer-mosquito/sync';
import { commandErrorFrom } from './command-error';

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
					// `isActive` goes only when it actually changed. The server turns
					// its presence into a `deactivate*Method` / `reactivate*Method`
					// command, which sits at the `ADMIN` floor, while the name and
					// custom-field edit beside it is `MANAGER`. Sending it
					// unconditionally put an admin-floor command in every manager's
					// rename, so the whole batch was refused and the manager floor the
					// server grants was unreachable from the UI (#65).
					//
					// An `original` with no `isActive` compares unequal and so still
					// sends it. That is the right way round: a collection update
					// always carries the row it started from, so the absent case is
					// defensive, and dropping a lifecycle change silently is worse
					// than a 403 that says what happened.
					const lifecycleChanged = mutation.original.isActive !== row.isActive;
					const result = await writeControlMethod(
						`${options.serverUrl}${options.endpointPath}/${row.id}`,
						'PATCH',
						{
							...toControlMethodPayload(row),
							...(lifecycleChanged ? { isActive: row.isActive } : {}),
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
		throw commandErrorFrom(response, result, `Unable to save ${fallbackName}.`);
	}

	return result;
}

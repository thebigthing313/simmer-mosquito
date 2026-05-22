interface ControlAssetMutationRow {
	readonly id: string;
	readonly metadata?: unknown | null;
	readonly isActive: boolean;
}

interface VehicleMutationRow extends ControlAssetMutationRow {
	readonly vehicleName: string;
}

interface EquipmentMutationRow extends ControlAssetMutationRow {
	readonly equipmentName: string;
	readonly serialNumber: string | null;
}

export function createVehicleMutationHandlers<TRow extends VehicleMutationRow>(options: {
	readonly serverUrl: string;
}) {
	return createControlAssetMutationHandlers<TRow>({
		serverUrl: options.serverUrl,
		endpointPath: '/control-assets/vehicles',
		fallbackName: 'vehicle',
		toPayload: (row) => ({
			id: row.id,
			vehicleName: row.vehicleName,
			metadata: row.metadata ?? null,
		}),
	});
}

export function createEquipmentMutationHandlers<TRow extends EquipmentMutationRow>(options: {
	readonly serverUrl: string;
}) {
	return createControlAssetMutationHandlers<TRow>({
		serverUrl: options.serverUrl,
		endpointPath: '/control-assets/equipment',
		fallbackName: 'equipment',
		toPayload: (row) => ({
			id: row.id,
			equipmentName: row.equipmentName,
			serialNumber: row.serialNumber,
			metadata: row.metadata ?? null,
		}),
	});
}

function createControlAssetMutationHandlers<TRow extends ControlAssetMutationRow>(options: {
	readonly serverUrl: string;
	readonly endpointPath: string;
	readonly fallbackName: string;
	readonly toPayload: (row: TRow) => Record<string, unknown>;
}) {
	return {
		onInsert: async ({ transaction }: CollectionMutationHandlerInput<TRow>) => {
			const txids = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const result = await writeControlAsset(
						`${options.serverUrl}${options.endpointPath}`,
						'POST',
						options.toPayload(mutation.modified),
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
					const result = await writeControlAsset(
						`${options.serverUrl}${options.endpointPath}/${row.id}`,
						'PATCH',
						{
							...options.toPayload(row),
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
					const result = await writeControlAsset(
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

interface ControlAssetMutationResult {
	readonly txid: number;
}

async function writeControlAsset(
	url: string,
	method: 'POST' | 'PATCH' | 'DELETE',
	body: unknown,
	fallbackName: string,
): Promise<ControlAssetMutationResult> {
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
		| ControlAssetMutationResult
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

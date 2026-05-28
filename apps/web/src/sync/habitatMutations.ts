import type { HabitatRow } from '@simmer-mosquito/sync';

export interface HabitatMutationLocationMetadata {
	readonly locationSource: {
		readonly kind: 'geometry';
		readonly geometry: unknown;
	};
}

export function createHabitatMutationHandlers(options: { readonly serverUrl: string }) {
	return {
		onInsert: async ({ transaction }: CollectionMutationHandlerInput<HabitatRow>) => {
			await Promise.all(
				transaction.mutations.map(async (mutation) => {
					await writeHabitat(
						`${options.serverUrl}/larval-surveillance/habitats`,
						toHabitatPayload(mutation.modified, mutation.metadata),
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
			readonly metadata: unknown;
		}[];
	};
}

interface HabitatMutationResult {
	readonly txid: number;
}

function toHabitatPayload(row: HabitatRow, metadata: unknown) {
	const locationMetadata = readLocationMetadata(metadata);

	return {
		id: row.id,
		locationSource: locationMetadata.locationSource,
		addressId: row.addressId,
		habitatTypeId: row.habitatTypeId,
		habitatName: row.habitatName,
		description: row.description,
		metadata: row.metadata,
	};
}

function readLocationMetadata(metadata: unknown): HabitatMutationLocationMetadata {
	if (!isRecord(metadata) || !isRecord(metadata.locationSource)) {
		throw new Error('Habitat geometry is required.');
	}

	const locationSource = metadata.locationSource;
	if (locationSource.kind !== 'geometry') {
		throw new Error('Habitat geometry is required.');
	}

	return {
		locationSource: {
			kind: 'geometry',
			geometry: locationSource.geometry,
		},
	};
}

async function writeHabitat(url: string, body: unknown): Promise<HabitatMutationResult> {
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
		| HabitatMutationResult
		| { readonly error: string; readonly reason?: string; readonly message?: string };

	if (!response.ok || !('txid' in result)) {
		throw new Error(
			'reason' in result && typeof result.reason === 'string'
				? result.reason
				: 'message' in result && typeof result.message === 'string'
					? result.message
					: 'Unable to save habitat.',
		);
	}

	return result;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

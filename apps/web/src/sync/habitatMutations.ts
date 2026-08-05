import type { HabitatRow } from '@simmer-mosquito/sync';
import { isNoOpUpdate, pickChanged } from './change-set';

export interface HabitatMutationLocationMetadata {
	readonly locationSource: {
		readonly kind: 'geometry';
		readonly geometry: unknown;
	};
}

const HABITAT_PATCH_KEYS = [
	'habitatName',
	'description',
	'addressId',
	'habitatTypeId',
	'isActive',
	'isInaccessible',
] as const satisfies readonly (keyof HabitatRow)[];

export function createHabitatMutationHandlers(options: { readonly serverUrl: string }) {
	const endpoint = `${options.serverUrl}/larval-surveillance/habitats`;
	return {
		onInsert: async ({ transaction }: HabitatInsertInput) => {
			await Promise.all(
				transaction.mutations.map(async (mutation) => {
					await writeHabitat(
						endpoint,
						'POST',
						toHabitatPayload(mutation.modified, mutation.metadata),
					);
				}),
			);
		},
		onUpdate: async ({ transaction }: HabitatUpdateInput) => {
			await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const body = pickChanged(
						mutation.original,
						mutation.modified,
						HABITAT_PATCH_KEYS,
						'habitats.update',
					);
					if (metadataChanged(mutation.original.metadata, mutation.modified.metadata)) {
						body.metadata = mutation.modified.metadata;
					}
					const locationSource = readOptionalLocationSource(mutation.metadata);
					if (locationSource !== undefined) {
						body.locationSource = locationSource;
					}
					if (isNoOpUpdate(body)) {
						return;
					}
					await writeHabitat(`${endpoint}/${mutation.modified.id}`, 'PATCH', body);
				}),
			);
		},
		onDelete: async ({ transaction }: HabitatDeleteInput) => {
			await Promise.all(
				transaction.mutations.map(async (mutation) => {
					if (mutation.original.id === undefined) {
						throw new Error('Unable to delete habitat without an id.');
					}
					await writeHabitat(`${endpoint}/${mutation.original.id}`, 'DELETE', undefined);
				}),
			);
		},
	};
}

interface HabitatInsertInput {
	readonly transaction: {
		readonly mutations: readonly {
			readonly modified: HabitatRow;
			readonly metadata: unknown;
		}[];
	};
}

interface HabitatUpdateInput {
	readonly transaction: {
		readonly mutations: readonly {
			readonly original: Partial<HabitatRow>;
			readonly modified: HabitatRow;
			readonly metadata?: unknown;
		}[];
	};
}

interface HabitatDeleteInput {
	readonly transaction: {
		readonly mutations: readonly {
			readonly original: Partial<HabitatRow>;
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

function readOptionalLocationSource(metadata: unknown): unknown {
	if (isRecord(metadata) && metadata.locationSource !== undefined) {
		return metadata.locationSource;
	}
	return undefined;
}

function metadataChanged(original: unknown, modified: unknown): boolean {
	return JSON.stringify(original ?? null) !== JSON.stringify(modified ?? null);
}

async function writeHabitat(
	url: string,
	method: 'POST' | 'PATCH' | 'DELETE',
	body: unknown,
): Promise<HabitatMutationResult> {
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

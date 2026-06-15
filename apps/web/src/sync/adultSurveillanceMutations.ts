import type { AdultCollectionRow, CollectionSpeciesRow, TrapRow } from '@simmer-mosquito/sync';

/**
 * Adult surveillance optimistic mutation handlers.
 *
 * Each collection issues a plain insert/update/delete; the handlers translate
 * those into the adult-surveillance command endpoints. Geometry (which is not
 * part of the synced row) travels through the mutation `metadata.locationSource`
 * channel, mirroring the habitat handler.
 */

interface MutationInput<TRow> {
	readonly transaction: {
		readonly mutations: readonly {
			readonly original: Partial<TRow>;
			readonly modified: TRow;
			readonly metadata?: unknown;
		}[];
	};
}

interface MutationResult {
	readonly txid: number;
}

// ---------------------------------------------------------------------------
// Traps
// ---------------------------------------------------------------------------

const TRAP_PATCH_KEYS = [
	'trapName',
	'trapCode',
	'description',
	'collectionMethodId',
	'collectionLureId',
	'addressId',
	'isActive',
] as const satisfies readonly (keyof TrapRow)[];

export function createTrapMutationHandlers(options: { readonly serverUrl: string }) {
	const endpoint = `${options.serverUrl}/adult-surveillance/traps`;
	return {
		onInsert: async ({ transaction }: MutationInput<TrapRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const result = await writeAdult(endpoint, 'POST', 'trap', {
						id: mutation.modified.id,
						locationSource: readLocationSource(mutation.metadata),
						collectionMethodId: mutation.modified.collectionMethodId,
						addressId: mutation.modified.addressId,
						collectionLureId: mutation.modified.collectionLureId,
						trapName: mutation.modified.trapName,
						trapCode: mutation.modified.trapCode,
						description: mutation.modified.description,
					});
					return result.txid;
				}),
			);
			return { txid };
		},
		onUpdate: async ({ transaction }: MutationInput<TrapRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const body = pickChanged(mutation.original, mutation.modified, TRAP_PATCH_KEYS);
					const locationSource = readOptionalLocationSource(mutation.metadata);
					if (locationSource !== undefined) {
						body.locationSource = locationSource;
					}
					const result = await writeAdult(
						`${endpoint}/${mutation.modified.id}`,
						'PATCH',
						'trap',
						body,
					);
					return result.txid;
				}),
			);
			return { txid };
		},
		onDelete: async ({ transaction }: MutationInput<TrapRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const id = requireId(mutation.original.id, 'trap');
					const result = await writeAdult(`${endpoint}/${id}`, 'DELETE', 'trap', undefined);
					return result.txid;
				}),
			);
			return { txid };
		},
	};
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

const COLLECTION_TIMING_KEYS = [
	'collectionTimingMode',
	'startedAt',
	'collectedAt',
	'collectionDate',
	'durationAmount',
	'durationUnitId',
] as const satisfies readonly (keyof AdultCollectionRow)[];

const COLLECTION_SCALAR_KEYS = [
	'collectionMethodId',
	'collectionLureId',
	'addressId',
	'setByProfileId',
	'collectedByProfileId',
	'hasProblem',
	'isZeroResult',
	'hasBycatch',
] as const satisfies readonly (keyof AdultCollectionRow)[];

export function createCollectionMutationHandlers(options: { readonly serverUrl: string }) {
	const endpoint = `${options.serverUrl}/adult-surveillance/collections`;
	return {
		onInsert: async ({ transaction }: MutationInput<AdultCollectionRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const row = mutation.modified;
					const result = await writeAdult(endpoint, 'POST', 'collection', {
						id: row.id,
						trapId: row.trapId,
						collectionMethodId: row.collectionMethodId,
						collectionLureId: row.collectionLureId,
						addressId: row.addressId,
						collectionTimingMode: row.collectionTimingMode,
						startedAt: row.startedAt,
						collectedAt: row.collectedAt,
						collectionDate: row.collectionDate,
						durationAmount: row.durationAmount,
						durationUnitId: row.durationUnitId,
						setByProfileId: row.setByProfileId,
						collectedByProfileId: row.collectedByProfileId,
						hasProblem: row.hasProblem,
						metadata: row.metadata,
						locationSource: readOptionalLocationSource(mutation.metadata),
					});
					return result.txid;
				}),
			);
			return { txid };
		},
		onUpdate: async ({ transaction }: MutationInput<AdultCollectionRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const body = pickChanged(mutation.original, mutation.modified, COLLECTION_SCALAR_KEYS);
					// Timing columns move together: if any changed, resend the whole set so the
					// server can rebuild a coherent CollectionTiming.
					if (hasChanged(mutation.original, mutation.modified, COLLECTION_TIMING_KEYS)) {
						for (const key of COLLECTION_TIMING_KEYS) {
							body[key] = mutation.modified[key];
						}
					}
					if (metadataChanged(mutation.original.metadata, mutation.modified.metadata)) {
						body.metadata = mutation.modified.metadata;
					}
					const locationSource = readOptionalLocationSource(mutation.metadata);
					if (locationSource !== undefined) {
						body.locationSource = locationSource;
					}
					const result = await writeAdult(
						`${endpoint}/${mutation.modified.id}`,
						'PATCH',
						'collection',
						body,
					);
					return result.txid;
				}),
			);
			return { txid };
		},
		onDelete: async ({ transaction }: MutationInput<AdultCollectionRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const id = requireId(mutation.original.id, 'collection');
					const result = await writeAdult(`${endpoint}/${id}`, 'DELETE', 'collection', undefined);
					return result.txid;
				}),
			);
			return { txid };
		},
	};
}

// ---------------------------------------------------------------------------
// Collection species counts
// ---------------------------------------------------------------------------

const COLLECTION_SPECIES_PATCH_KEYS = [
	'count',
	'speciesId',
	'sex',
	'status',
	'identifiedByProfileId',
	'identifiedDate',
] as const satisfies readonly (keyof CollectionSpeciesRow)[];

export function createCollectionSpeciesMutationHandlers(options: { readonly serverUrl: string }) {
	const endpoint = `${options.serverUrl}/adult-surveillance/collection-species`;
	return {
		onInsert: async ({ transaction }: MutationInput<CollectionSpeciesRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const row = mutation.modified;
					const result = await writeAdult(endpoint, 'POST', 'species count', {
						id: row.id,
						collectionId: row.collectionId,
						speciesId: row.speciesId,
						count: row.count,
						sex: row.sex,
						status: row.status,
						identifiedByProfileId: row.identifiedByProfileId,
						identifiedDate: row.identifiedDate,
					});
					return result.txid;
				}),
			);
			return { txid };
		},
		onUpdate: async ({ transaction }: MutationInput<CollectionSpeciesRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const body = pickChanged(
						mutation.original,
						mutation.modified,
						COLLECTION_SPECIES_PATCH_KEYS,
					);
					const result = await writeAdult(
						`${endpoint}/${mutation.modified.id}`,
						'PATCH',
						'species count',
						body,
					);
					return result.txid;
				}),
			);
			return { txid };
		},
		onDelete: async ({ transaction }: MutationInput<CollectionSpeciesRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const id = requireId(mutation.original.id, 'species count');
					const result = await writeAdult(
						`${endpoint}/${id}`,
						'DELETE',
						'species count',
						undefined,
					);
					return result.txid;
				}),
			);
			return { txid };
		},
	};
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function pickChanged<TRow extends object, TKey extends keyof TRow>(
	original: Partial<TRow>,
	modified: TRow,
	keys: readonly TKey[],
): Record<string, unknown> {
	const body: Record<string, unknown> = {};
	for (const key of keys) {
		if (original[key] !== modified[key]) {
			body[key as string] = modified[key];
		}
	}
	return body;
}

function hasChanged<TRow extends object, TKey extends keyof TRow>(
	original: Partial<TRow>,
	modified: TRow,
	keys: readonly TKey[],
): boolean {
	return keys.some((key) => original[key] !== modified[key]);
}

function metadataChanged(original: unknown, modified: unknown): boolean {
	return JSON.stringify(original ?? null) !== JSON.stringify(modified ?? null);
}

function readLocationSource(metadata: unknown): unknown {
	const source = readOptionalLocationSource(metadata);
	if (source === undefined) {
		throw new Error('A location is required.');
	}
	return source;
}

function readOptionalLocationSource(metadata: unknown): unknown {
	if (isRecord(metadata) && metadata.locationSource !== undefined) {
		return metadata.locationSource;
	}
	return undefined;
}

function requireId(id: string | undefined, noun: string): string {
	if (id === undefined) {
		throw new Error(`Unable to delete ${noun} without an id.`);
	}
	return id;
}

async function writeAdult(
	url: string,
	method: 'POST' | 'PATCH' | 'DELETE',
	noun: string,
	body: unknown,
): Promise<MutationResult> {
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
		| MutationResult
		| { readonly error: string; readonly reason?: string; readonly message?: string };

	if (!response.ok || !('txid' in result)) {
		throw new Error(
			'reason' in result && typeof result.reason === 'string'
				? result.reason
				: 'message' in result && typeof result.message === 'string'
					? result.message
					: `Unable to save ${noun}.`,
		);
	}

	return result;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

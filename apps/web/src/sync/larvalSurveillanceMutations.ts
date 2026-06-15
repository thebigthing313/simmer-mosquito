import type { InspectionRow, SampleRow, SampleSpeciesRow } from '@simmer-mosquito/sync';

/**
 * Larval surveillance optimistic mutation handlers for inspections, samples,
 * and sample-species counts. Habitats are handled in `habitatMutations.ts`.
 * Ad-hoc inspection geometry travels through `metadata.locationSource`.
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
// Inspections
// ---------------------------------------------------------------------------

const INSPECTION_RESULT_KEYS = [
	'inspectionDate',
	'isWet',
	'dipCount',
	'density',
	'larvaeCount',
	'hasFirstInstar',
	'hasSecondInstar',
	'hasThirdInstar',
	'hasFourthInstar',
	'hasPupae',
	'hasEggs',
	'inspectedByProfileId',
] as const satisfies readonly (keyof InspectionRow)[];

const INSPECTION_LOCATION_KEYS = [
	'addressId',
	'habitatTypeId',
] as const satisfies readonly (keyof InspectionRow)[];

export function createInspectionMutationHandlers(options: { readonly serverUrl: string }) {
	const endpoint = `${options.serverUrl}/larval-surveillance/inspections`;
	return {
		onInsert: async ({ transaction }: MutationInput<InspectionRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const row = mutation.modified;
					const result = await writeLarval(endpoint, 'POST', 'inspection', {
						id: row.id,
						habitatId: row.habitatId,
						habitatTypeId: row.habitatTypeId,
						addressId: row.addressId,
						inspectedByProfileId: row.inspectedByProfileId,
						inspectionDate: row.inspectionDate,
						isWet: row.isWet,
						dipCount: row.dipCount,
						density: row.density,
						larvaeCount: row.larvaeCount,
						hasFirstInstar: row.hasFirstInstar,
						hasSecondInstar: row.hasSecondInstar,
						hasThirdInstar: row.hasThirdInstar,
						hasFourthInstar: row.hasFourthInstar,
						hasPupae: row.hasPupae,
						hasEggs: row.hasEggs,
						locationSource: readOptionalLocationSource(mutation.metadata),
					});
					return result.txid;
				}),
			);
			return { txid };
		},
		onUpdate: async ({ transaction }: MutationInput<InspectionRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const body: Record<string, unknown> = {};
					// The field-details command rebuilds the whole inspection result, so
					// resend every result field when any one of them changed.
					if (hasChanged(mutation.original, mutation.modified, INSPECTION_RESULT_KEYS)) {
						for (const key of INSPECTION_RESULT_KEYS) {
							body[key] = mutation.modified[key];
						}
					}
					Object.assign(
						body,
						pickChanged(mutation.original, mutation.modified, INSPECTION_LOCATION_KEYS),
					);
					const locationSource = readOptionalLocationSource(mutation.metadata);
					if (locationSource !== undefined) {
						body.locationSource = locationSource;
					}
					const result = await writeLarval(
						`${endpoint}/${mutation.modified.id}`,
						'PATCH',
						'inspection',
						body,
					);
					return result.txid;
				}),
			);
			return { txid };
		},
		onDelete: async ({ transaction }: MutationInput<InspectionRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const id = requireId(mutation.original.id, 'inspection');
					const result = await writeLarval(`${endpoint}/${id}`, 'DELETE', 'inspection', undefined);
					return result.txid;
				}),
			);
			return { txid };
		},
	};
}

// ---------------------------------------------------------------------------
// Samples
// ---------------------------------------------------------------------------

const SAMPLE_PATCH_KEYS = [
	'displayName',
	'isZeroLarvae',
	'hasNonMosquito',
	'unidentifiableReason',
] as const satisfies readonly (keyof SampleRow)[];

export function createSampleMutationHandlers(options: { readonly serverUrl: string }) {
	const endpoint = `${options.serverUrl}/larval-surveillance/samples`;
	return {
		onInsert: async ({ transaction }: MutationInput<SampleRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const result = await writeLarval(endpoint, 'POST', 'sample', {
						id: mutation.modified.id,
						inspectionId: mutation.modified.inspectionId,
						displayName: mutation.modified.displayName,
					});
					return result.txid;
				}),
			);
			return { txid };
		},
		onUpdate: async ({ transaction }: MutationInput<SampleRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const body = pickChanged(mutation.original, mutation.modified, SAMPLE_PATCH_KEYS);
					const result = await writeLarval(
						`${endpoint}/${mutation.modified.id}`,
						'PATCH',
						'sample',
						body,
					);
					return result.txid;
				}),
			);
			return { txid };
		},
		onDelete: async ({ transaction }: MutationInput<SampleRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const id = requireId(mutation.original.id, 'sample');
					const result = await writeLarval(`${endpoint}/${id}`, 'DELETE', 'sample', undefined);
					return result.txid;
				}),
			);
			return { txid };
		},
	};
}

// ---------------------------------------------------------------------------
// Sample species counts
// ---------------------------------------------------------------------------

const SAMPLE_SPECIES_PATCH_KEYS = [
	'speciesId',
	'larvaeCount',
	'identifiedByProfileId',
	'identifiedAt',
] as const satisfies readonly (keyof SampleSpeciesRow)[];

export function createSampleSpeciesMutationHandlers(options: { readonly serverUrl: string }) {
	const endpoint = `${options.serverUrl}/larval-surveillance/sample-species`;
	return {
		onInsert: async ({ transaction }: MutationInput<SampleSpeciesRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const row = mutation.modified;
					const result = await writeLarval(endpoint, 'POST', 'species count', {
						id: row.id,
						sampleId: row.sampleId,
						speciesId: row.speciesId,
						larvaeCount: row.larvaeCount,
						identifiedByProfileId: row.identifiedByProfileId,
						identifiedAt: row.identifiedAt,
					});
					return result.txid;
				}),
			);
			return { txid };
		},
		onUpdate: async ({ transaction }: MutationInput<SampleSpeciesRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const body = pickChanged(mutation.original, mutation.modified, SAMPLE_SPECIES_PATCH_KEYS);
					const result = await writeLarval(
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
		onDelete: async ({ transaction }: MutationInput<SampleSpeciesRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const id = requireId(mutation.original.id, 'species count');
					const result = await writeLarval(
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

async function writeLarval(
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

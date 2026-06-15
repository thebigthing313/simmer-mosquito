import type { OrganizationSpeciesRow, RegionFolderRow, RegionRow } from '@simmer-mosquito/sync';

/**
 * Foundation geography + agency taxonomy optimistic mutation handlers: region
 * folders, regions, and organization-species selection.
 *
 * Region polygon geometry is not part of the synced row, so it travels through
 * the mutation `metadata.geometry` channel. Organization-species selection is
 * add/remove only.
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

interface RecordHandlerConfig<TRow extends { readonly id: string }> {
	readonly serverUrl: string;
	readonly path: string;
	readonly noun: string;
	readonly insertKeys: readonly (keyof TRow)[];
	readonly patchKeys: readonly (keyof TRow)[];
	readonly hasGeometry?: boolean;
	readonly noUpdate?: boolean;
}

function createRecordHandlers<TRow extends { readonly id: string }>(
	config: RecordHandlerConfig<TRow>,
) {
	const endpoint = `${config.serverUrl}${config.path}`;
	const handlers: {
		onInsert: (input: MutationInput<TRow>) => Promise<{ txid: number[] }>;
		onUpdate?: (input: MutationInput<TRow>) => Promise<{ txid: number[] }>;
		onDelete: (input: MutationInput<TRow>) => Promise<{ txid: number[] }>;
	} = {
		onInsert: async ({ transaction }: MutationInput<TRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const body: Record<string, unknown> = { id: mutation.modified.id };
					for (const key of config.insertKeys) {
						body[key as string] = mutation.modified[key];
					}
					if (config.hasGeometry) {
						body.geometry = readGeometry(mutation.metadata);
					}
					const result = await writeRecord(endpoint, 'POST', config.noun, body);
					return result.txid;
				}),
			);
			return { txid };
		},
		onDelete: async ({ transaction }: MutationInput<TRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const id = requireId(mutation.original.id, config.noun);
					const result = await writeRecord(`${endpoint}/${id}`, 'DELETE', config.noun, undefined);
					return result.txid;
				}),
			);
			return { txid };
		},
	};

	if (!config.noUpdate) {
		handlers.onUpdate = async ({ transaction }: MutationInput<TRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const body = pickChanged(mutation.original, mutation.modified, config.patchKeys);
					if (config.hasGeometry) {
						const geometry = readOptionalGeometry(mutation.metadata);
						if (geometry !== undefined) {
							body.geometry = geometry;
						}
					}
					const result = await writeRecord(
						`${endpoint}/${mutation.modified.id}`,
						'PATCH',
						config.noun,
						body,
					);
					return result.txid;
				}),
			);
			return { txid };
		};
	}

	return handlers;
}

export function createRegionFolderMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<RegionFolderRow>({
		serverUrl: options.serverUrl,
		path: '/foundation/region-folders',
		noun: 'region folder',
		insertKeys: ['name', 'description'],
		patchKeys: ['name', 'description'],
	});
}

export function createRegionMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<RegionRow>({
		serverUrl: options.serverUrl,
		path: '/foundation/regions',
		noun: 'region',
		hasGeometry: true,
		insertKeys: ['regionFolderId', 'name', 'description', 'metadata'],
		patchKeys: ['regionFolderId', 'name', 'description', 'metadata'],
	});
}

export function createOrganizationSpeciesMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<OrganizationSpeciesRow>({
		serverUrl: options.serverUrl,
		path: '/foundation/organization-species',
		noun: 'organization species',
		noUpdate: true,
		insertKeys: ['speciesId'],
		patchKeys: [],
	});
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
		if (!shallowEqual(original[key], modified[key])) {
			body[key as string] = modified[key];
		}
	}
	return body;
}

function shallowEqual(a: unknown, b: unknown): boolean {
	if (a === b) {
		return true;
	}
	if (typeof a === 'object' || typeof b === 'object') {
		return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
	}
	return false;
}

function readGeometry(metadata: unknown): unknown {
	const geometry = readOptionalGeometry(metadata);
	if (geometry === undefined) {
		throw new Error('A region boundary is required.');
	}
	return geometry;
}

function readOptionalGeometry(metadata: unknown): unknown {
	if (isRecord(metadata) && metadata.geometry !== undefined) {
		return metadata.geometry;
	}
	return undefined;
}

function requireId(id: string | undefined, noun: string): string {
	if (id === undefined) {
		throw new Error(`Unable to delete ${noun} without an id.`);
	}
	return id;
}

async function writeRecord(
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

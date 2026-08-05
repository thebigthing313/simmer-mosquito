import type {
	ApplicationBatchRow,
	ApplicationRow,
	BiocontrolActionRow,
	FormulationInsecticideRow,
	FormulationRow,
	OutreachActionRow,
	RequestedControlActionRow,
	SourceReductionRow,
} from '@simmer-mosquito/sync';
import { isNoOpUpdate, pickChanged } from './change-set';
import { commandErrorFrom } from './command-error';

/**
 * Control operations optimistic mutation handlers — formulations, formulation
 * insecticides, the four performed control-action types (+ application batches),
 * and requested control actions.
 *
 * Each is a thin wrapper over the shared {@link createRecordHandlers} factory:
 * insert sends the row's create fields, update sends a diff, delete sends the id.
 * Performed actions carry geometry through `metadata.locationSource`, and their
 * larval/adult context rides along as the habitat/inspection/collection id
 * columns the server reads back into a ControlActionContext.
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
	readonly hasLocation?: boolean;
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
					if (config.hasLocation) {
						const locationSource = readOptionalLocationSource(mutation.metadata);
						if (locationSource !== undefined) {
							body.locationSource = locationSource;
						}
					}
					const result = await writeControlOp(endpoint, 'POST', config.noun, body);
					return result.txid;
				}),
			);
			return { txid };
		},
		onDelete: async ({ transaction }: MutationInput<TRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const id = requireId(mutation.original.id, config.noun);
					const result = await writeControlOp(
						`${endpoint}/${id}`,
						'DELETE',
						config.noun,
						undefined,
					);
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
					const body = pickChanged(
						mutation.original,
						mutation.modified,
						config.patchKeys,
						`${config.noun}.update`,
					);
					if (config.hasLocation) {
						const locationSource = readOptionalLocationSource(mutation.metadata);
						if (locationSource !== undefined) {
							body.locationSource = locationSource;
						}
					}
					if (isNoOpUpdate(body)) {
						return null;
					}
					const result = await writeControlOp(
						`${endpoint}/${mutation.modified.id}`,
						'PATCH',
						config.noun,
						body,
					);
					return result.txid;
				}),
			);
			return { txid: txid.filter((value) => value !== null) };
		};
	}

	return handlers;
}

export function createFormulationMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<FormulationRow>({
		serverUrl: options.serverUrl,
		path: '/control-operations/formulations',
		noun: 'formulation',
		insertKeys: ['formulationName', 'description', 'batchSize', 'batchUnitId'],
		patchKeys: ['formulationName', 'description', 'batchSize', 'batchUnitId', 'isActive'],
	});
}

export function createFormulationInsecticideMutationHandlers(options: {
	readonly serverUrl: string;
}) {
	return createRecordHandlers<FormulationInsecticideRow>({
		serverUrl: options.serverUrl,
		path: '/control-operations/formulation-insecticides',
		noun: 'formulation insecticide',
		insertKeys: ['formulationId', 'insecticideId', 'amount', 'unitId'],
		patchKeys: ['insecticideId', 'amount', 'unitId'],
	});
}

export function createApplicationMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<ApplicationRow>({
		serverUrl: options.serverUrl,
		path: '/control-operations/applications',
		noun: 'application',
		hasLocation: true,
		insertKeys: APPLICATION_FIELD_KEYS,
		patchKeys: APPLICATION_FIELD_KEYS,
	});
}

export function createApplicationBatchMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<ApplicationBatchRow>({
		serverUrl: options.serverUrl,
		path: '/control-operations/application-batches',
		noun: 'application batch',
		noUpdate: true,
		insertKeys: ['applicationId', 'insecticideBatchId'],
		patchKeys: [],
	});
}

export function createSourceReductionMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<SourceReductionRow>({
		serverUrl: options.serverUrl,
		path: '/control-operations/source-reductions',
		noun: 'source reduction',
		hasLocation: true,
		insertKeys: SOURCE_REDUCTION_FIELD_KEYS,
		patchKeys: SOURCE_REDUCTION_FIELD_KEYS,
	});
}

export function createOutreachActionMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<OutreachActionRow>({
		serverUrl: options.serverUrl,
		path: '/control-operations/outreach-actions',
		noun: 'outreach action',
		hasLocation: true,
		insertKeys: OUTREACH_ACTION_FIELD_KEYS,
		patchKeys: OUTREACH_ACTION_FIELD_KEYS,
	});
}

export function createBiocontrolActionMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<BiocontrolActionRow>({
		serverUrl: options.serverUrl,
		path: '/control-operations/biocontrol-actions',
		noun: 'biocontrol action',
		hasLocation: true,
		insertKeys: BIOCONTROL_ACTION_FIELD_KEYS,
		patchKeys: BIOCONTROL_ACTION_FIELD_KEYS,
	});
}

export function createRequestedControlActionMutationHandlers(options: {
	readonly serverUrl: string;
}) {
	return createRecordHandlers<RequestedControlActionRow>({
		serverUrl: options.serverUrl,
		path: '/control-operations/requested-control-actions',
		noun: 'requested control action',
		hasLocation: true,
		insertKeys: [
			'controlType',
			'recommendedMethodId',
			'summary',
			'addressId',
			'habitatId',
			'inspectionId',
			'collectionId',
			'requestedByProfileId',
			'requestedAt',
		],
		patchKeys: [
			'controlType',
			'recommendedMethodId',
			'summary',
			'addressId',
			'habitatId',
			'inspectionId',
			'collectionId',
			'requestedByProfileId',
			'requestedAt',
			'resolvedAt',
		],
	});
}

const APPLICATION_FIELD_KEYS = [
	'insecticideId',
	'amountApplied',
	'applicationUnitId',
	'applicationDate',
	'applicatorProfileId',
	'applicationMethodId',
	'vehicleId',
	'equipmentId',
	'addressId',
	'habitatId',
	'inspectionId',
	'collectionId',
	'requestedControlActionId',
	'metadata',
] as const satisfies readonly (keyof ApplicationRow)[];

const SOURCE_REDUCTION_FIELD_KEYS = [
	'sourceReductionMethodId',
	'technicianProfileId',
	'sourceReductionDate',
	'sourcesEliminatedAmount',
	'sourcesEliminatedUnitId',
	'addressId',
	'habitatId',
	'inspectionId',
	'requestedControlActionId',
	'metadata',
] as const satisfies readonly (keyof SourceReductionRow)[];

const OUTREACH_ACTION_FIELD_KEYS = [
	'outreachMethodId',
	'technicianProfileId',
	'outreachDate',
	'reach',
	'reachDescription',
	'addressId',
	'inspectionId',
	'requestedControlActionId',
	'metadata',
] as const satisfies readonly (keyof OutreachActionRow)[];

const BIOCONTROL_ACTION_FIELD_KEYS = [
	'biocontrolMethodId',
	'technicianProfileId',
	'biocontrolDate',
	'amountReleased',
	'releaseUnitId',
	'addressId',
	'habitatId',
	'inspectionId',
	'requestedControlActionId',
	'metadata',
] as const satisfies readonly (keyof BiocontrolActionRow)[];

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

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

async function writeControlOp(
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
		throw commandErrorFrom(response, result, `Unable to save ${noun}.`);
	}

	return result;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

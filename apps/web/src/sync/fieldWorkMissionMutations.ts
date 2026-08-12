import type {
	AdditionalPersonnelRow,
	AssignmentItemRow,
	AssignmentRow,
	CommentRow,
	MissionItemRow,
	MissionRow,
	RouteItemRow,
	RouteRow,
	TagItemRow,
} from '@simmer-mosquito/sync';
import { isNoOpUpdate, pickChanged } from './change-set';
import { commandErrorFrom, readResponseBody } from './command-error';

/**
 * Field-work + mission-dispatch optimistic mutation handlers (comments, tag
 * assignments, additional personnel, routes/route items, assignments/assignment
 * items, missions/mission items).
 *
 * Each is a thin wrapper over the shared {@link createRecordHandlers} factory:
 * insert sends the row's create fields, update sends a diff (the server derives
 * lifecycle transitions from the changed timestamp fields), delete sends the id.
 * Mission-item geometry rides on `metadata.locationSource`. New ordered items
 * append; reordering uses the dedicated `/move-items` endpoints.
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
	/**
	 * Whether a reopen on this record carries the operator's reason.
	 *
	 * Reopening writes a comment server-side, and the reason is its text — but it
	 * is not a column on the row, so it rides as metadata the way geometry does
	 * rather than through the diff. Sent whenever it is present: the endpoint reads
	 * it only on the reopen branch, so an edit that somehow carried one is ignored
	 * rather than misfiled.
	 */
	readonly hasReopenReason?: boolean;
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
					if (config.hasReopenReason) {
						const reopenReason = readOptionalReopenReason(mutation.metadata);
						if (reopenReason !== undefined) {
							body.reopenReason = reopenReason;
						}
					}
					if (isNoOpUpdate(body)) {
						return null;
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
			return { txid: txid.filter((value) => value !== null) };
		};
	}

	return handlers;
}

export function createCommentMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<CommentRow>({
		serverUrl: options.serverUrl,
		path: '/field-work/comments',
		noun: 'comment',
		insertKeys: ['entityType', 'entityId', 'commentText', 'commentedAt'],
		patchKeys: ['commentText', 'isPinned'],
	});
}

export function createTagItemMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<TagItemRow>({
		serverUrl: options.serverUrl,
		path: '/field-work/tag-items',
		noun: 'tag assignment',
		noUpdate: true,
		insertKeys: ['tagId', 'entityType', 'entityId'],
		patchKeys: [],
	});
}

export function createAdditionalPersonnelMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<AdditionalPersonnelRow>({
		serverUrl: options.serverUrl,
		path: '/field-work/additional-personnel',
		noun: 'additional personnel',
		noUpdate: true,
		insertKeys: ['personnelProfileId', 'entityType', 'entityId'],
		patchKeys: [],
	});
}

export function createRouteMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<RouteRow>({
		serverUrl: options.serverUrl,
		path: '/field-work/routes',
		noun: 'route',
		insertKeys: ['routeName', 'routeType'],
		patchKeys: ['routeName'],
	});
}

export function createRouteItemMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<RouteItemRow>({
		serverUrl: options.serverUrl,
		path: '/field-work/route-items',
		noun: 'route item',
		insertKeys: ['routeId', 'entityType', 'entityId', 'directionsToNextItem'],
		patchKeys: ['directionsToNextItem'],
	});
}

export function createAssignmentMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<AssignmentRow>({
		serverUrl: options.serverUrl,
		path: '/field-work/assignments',
		noun: 'assignment',
		insertKeys: ['assignmentDate', 'assignmentName', 'assignedToProfileId', 'dueAt'],
		patchKeys: [
			'assignmentDate',
			'assignmentName',
			'assignedToProfileId',
			'dueAt',
			'startedAt',
			'completedAt',
			'cancelledAt',
			'cancellationReason',
		],
	});
}

export function createAssignmentItemMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<AssignmentItemRow>({
		serverUrl: options.serverUrl,
		path: '/field-work/assignment-items',
		noun: 'assignment item',
		insertKeys: ['assignmentId', 'entityType', 'entityId', 'directionsToNextItem'],
		patchKeys: ['directionsToNextItem', 'completedAt', 'skippedAt', 'skipReason'],
	});
}

export function createMissionMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<MissionRow>({
		serverUrl: options.serverUrl,
		path: '/mission-dispatch/missions',
		noun: 'mission',
		hasReopenReason: true,
		insertKeys: [
			'controlType',
			'scheduledStartAt',
			'missionName',
			'plannedMethodId',
			'assignedToProfileId',
			'scheduledEndAt',
			'rainDate',
			'notificationTypeId',
		],
		patchKeys: [
			'missionName',
			'scheduledStartAt',
			'scheduledEndAt',
			'rainDate',
			'controlType',
			'plannedMethodId',
			'assignedToProfileId',
			'notificationTypeId',
			'startedAt',
			'completedAt',
			'cancelledAt',
			'cancellationReason',
		],
	});
}

export function createMissionItemMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<MissionItemRow>({
		serverUrl: options.serverUrl,
		path: '/mission-dispatch/mission-items',
		noun: 'mission item',
		hasLocation: true,
		insertKeys: ['missionId', 'addressId', 'requestedControlActionId'],
		patchKeys: ['addressId', 'requestedControlActionId', 'completedAt', 'skippedAt', 'skipReason'],
	});
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function readOptionalLocationSource(metadata: unknown): unknown {
	if (isRecord(metadata) && metadata.locationSource !== undefined) {
		return metadata.locationSource;
	}
	return undefined;
}

function readOptionalReopenReason(metadata: unknown): string | undefined {
	if (isRecord(metadata) && typeof metadata.reopenReason === 'string') {
		return metadata.reopenReason.length === 0 ? undefined : metadata.reopenReason;
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
	const result = (await readResponseBody(response)) as
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

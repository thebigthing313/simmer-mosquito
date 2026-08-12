import type {
	ContactRow,
	MissionNotificationRow,
	NotificationRegistrationRow,
	NotificationRegistrationTypeRow,
	ServiceRequestRow,
} from '@simmer-mosquito/sync';
import { isNoOpUpdate, pickChanged } from './change-set';
import { commandErrorFrom, readResponseBody } from './command-error';

/**
 * Public engagement optimistic mutation handlers: contacts, service requests,
 * notification registrations (+ registration-type subscriptions), and mission
 * notification status transitions.
 *
 * Contacts and registration-type subscriptions use the shared
 * {@link createRecordHandlers} factory. Service requests and notification
 * registrations reference an existing contact/address (created via their own
 * collections first) and carry their point geometry through `metadata.geometry`.
 * Mission notifications are generated server-side; only status changes are sent.
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
// Generic factory (contacts, registration-type subscriptions)
// ---------------------------------------------------------------------------

interface RecordHandlerConfig<TRow extends { readonly id: string }> {
	readonly serverUrl: string;
	readonly path: string;
	readonly noun: string;
	readonly insertKeys: readonly (keyof TRow)[];
	readonly patchKeys: readonly (keyof TRow)[];
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

export function createContactMutationHandlers(options: { readonly serverUrl: string }) {
	return createRecordHandlers<ContactRow>({
		serverUrl: options.serverUrl,
		path: '/public-engagement/contacts',
		noun: 'contact',
		insertKeys: CONTACT_KEYS,
		patchKeys: CONTACT_KEYS,
	});
}

export function createNotificationRegistrationTypeMutationHandlers(options: {
	readonly serverUrl: string;
}) {
	return createRecordHandlers<NotificationRegistrationTypeRow>({
		serverUrl: options.serverUrl,
		path: '/public-engagement/notification-registration-types',
		noun: 'registration subscription',
		noUpdate: true,
		insertKeys: ['notificationRegistrationId', 'notificationTypeId'],
		patchKeys: [],
	});
}

const CONTACT_KEYS = [
	'contactName',
	'preferredPhone',
	'alternatePhone',
	'email',
	'company',
	'department',
	'title',
	'wantsEmail',
	'wantsSms',
	'wantsPhone',
] as const satisfies readonly (keyof ContactRow)[];

// ---------------------------------------------------------------------------
// Service requests (existing contact/address refs + geometry via metadata)
// ---------------------------------------------------------------------------

const SERVICE_REQUEST_PATCH_KEYS = [
	'requestDate',
	'intakeType',
	'receivedByProfileId',
	'details',
	'contactId',
	'closedAt',
] as const satisfies readonly (keyof ServiceRequestRow)[];

export function createServiceRequestMutationHandlers(options: { readonly serverUrl: string }) {
	const endpoint = `${options.serverUrl}/public-engagement/service-requests`;
	return {
		onInsert: async ({ transaction }: MutationInput<ServiceRequestRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const row = mutation.modified;
					const result = await writeRecord(endpoint, 'POST', 'service request', {
						id: row.id,
						contact: { kind: 'existing', contactId: row.contactId },
						location: {
							address: { kind: 'existing', addressId: row.addressId },
							geometry: readGeometry(mutation.metadata),
						},
						intakeType: row.intakeType,
						requestDate: row.requestDate,
						details: row.details,
						receivedByProfileId: row.receivedByProfileId,
					});
					return result.txid;
				}),
			);
			return { txid };
		},
		onUpdate: async ({ transaction }: MutationInput<ServiceRequestRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const body = pickChanged(
						mutation.original,
						mutation.modified,
						SERVICE_REQUEST_PATCH_KEYS,
						'serviceRequests.update',
					);
					// A close or reopen records a comment server-side, and its text is the
					// operator's, so it rides beside the timestamp that selects which of
					// the two commands runs. Only when `closedAt` actually changed: the
					// reason is meaningless on any other edit, and adding a key here would
					// turn a genuine no-op into a PATCH.
					if ('closedAt' in body) {
						Object.assign(body, readLifecycleReason(mutation.metadata, body.closedAt === null));
					}
					if (isNoOpUpdate(body)) {
						return null;
					}
					const result = await writeRecord(
						`${endpoint}/${mutation.modified.id}`,
						'PATCH',
						'service request',
						body,
					);
					return result.txid;
				}),
			);
			return { txid: txid.filter((value) => value !== null) };
		},
		onDelete: async ({ transaction }: MutationInput<ServiceRequestRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const id = requireId(mutation.original.id, 'service request');
					const result = await writeRecord(
						`${endpoint}/${id}`,
						'DELETE',
						'service request',
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
// Notification registrations
// ---------------------------------------------------------------------------

const REGISTRATION_PATCH_KEYS = [
	'hasBees',
	'isNoSpray',
	'bufferDistance',
	'bufferUnitId',
	'contactId',
	'isActive',
] as const satisfies readonly (keyof NotificationRegistrationRow)[];

export function createNotificationRegistrationMutationHandlers(options: {
	readonly serverUrl: string;
}) {
	const endpoint = `${options.serverUrl}/public-engagement/notification-registrations`;
	return {
		onInsert: async ({ transaction }: MutationInput<NotificationRegistrationRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const row = mutation.modified;
					const result = await writeRecord(endpoint, 'POST', 'notification registration', {
						id: row.id,
						contact: { kind: 'existing', contactId: row.contactId },
						location: {
							address:
								row.addressId === null
									? { kind: 'none' }
									: { kind: 'existing', addressId: row.addressId },
							geometry: readGeometry(mutation.metadata),
						},
						bufferDistance: row.bufferDistance,
						bufferUnitId: row.bufferUnitId,
						hasBees: row.hasBees,
						isNoSpray: row.isNoSpray,
						subscriptions: [],
					});
					return result.txid;
				}),
			);
			return { txid };
		},
		onUpdate: async ({ transaction }: MutationInput<NotificationRegistrationRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const body = pickChanged(
						mutation.original,
						mutation.modified,
						REGISTRATION_PATCH_KEYS,
						'notificationRegistrations.update',
					);
					if (isNoOpUpdate(body)) {
						return null;
					}
					const result = await writeRecord(
						`${endpoint}/${mutation.modified.id}`,
						'PATCH',
						'notification registration',
						body,
					);
					return result.txid;
				}),
			);
			return { txid: txid.filter((value) => value !== null) };
		},
		onDelete: async ({ transaction }: MutationInput<NotificationRegistrationRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const id = requireId(mutation.original.id, 'notification registration');
					const result = await writeRecord(
						`${endpoint}/${id}`,
						'DELETE',
						'notification registration',
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
// Mission notifications (status only; generated server-side)
// ---------------------------------------------------------------------------

export function createMissionNotificationMutationHandlers(options: { readonly serverUrl: string }) {
	const endpoint = `${options.serverUrl}/public-engagement/mission-notifications`;
	return {
		onUpdate: async ({ transaction }: MutationInput<MissionNotificationRow>) => {
			const txid = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const result = await writeRecord(
						`${endpoint}/${mutation.modified.id}`,
						'PATCH',
						'mission notification',
						{
							status: mutation.modified.status,
							statusChangedAt: mutation.modified.statusChangedAt,
						},
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

function readGeometry(metadata: unknown): unknown {
	if (isRecord(metadata) && metadata.geometry !== undefined) {
		return metadata.geometry;
	}
	throw new Error('A location is required.');
}

/**
 * The reason a close or reopen carries, as the field the endpoint reads it under.
 *
 * Two names for what is one box on screen, because they reach two different
 * commands. Nothing is returned when the caller supplied no reason — a close made
 * from somewhere without a dialog still closes, and the server falls back to its
 * own plain wording rather than the write failing.
 */
function readLifecycleReason(metadata: unknown, isReopen: boolean): Record<string, string> {
	if (!isRecord(metadata)) {
		return {};
	}
	const key = isReopen ? 'reopenReason' : 'resolutionSummary';
	const reason = metadata[key];
	return typeof reason === 'string' && reason.length > 0 ? { [key]: reason } : {};
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

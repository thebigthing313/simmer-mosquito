import { createRowPayloadMapper } from '@simmer-mosquito/sync';
import { commandErrorFrom } from './command-error';

interface NotificationTypeMutationRow {
	readonly id: string;
	readonly name: string;
	readonly description: string | null;
	readonly isActive: boolean;
}

const mapNotificationTypePayload = createRowPayloadMapper<NotificationTypeMutationRow>([
	'id',
	'name',
	'description',
] as const);

export function createNotificationTypeMutationHandlers<
	TRow extends NotificationTypeMutationRow,
>(options: { readonly serverUrl: string }) {
	return {
		onInsert: async ({ transaction }: CollectionMutationHandlerInput<TRow>) => {
			const txids = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const result = await writeNotificationType(
						`${options.serverUrl}/public-engagement/notification-types`,
						'POST',
						toNotificationTypePayload(mutation.modified),
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
					const result = await writeNotificationType(
						`${options.serverUrl}/public-engagement/notification-types/${row.id}`,
						'PATCH',
						{
							...toNotificationTypePayload(row),
							isActive: row.isActive,
						},
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
						throw new Error('Unable to delete notification type without an id.');
					}
					const result = await writeNotificationType(
						`${options.serverUrl}/public-engagement/notification-types/${mutation.original.id}`,
						'DELETE',
						undefined,
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

interface NotificationTypeMutationResult {
	readonly txid: number;
}

function toNotificationTypePayload(row: NotificationTypeMutationRow) {
	return mapNotificationTypePayload(row);
}

async function writeNotificationType(
	url: string,
	method: 'POST' | 'PATCH' | 'DELETE',
	body: unknown,
): Promise<NotificationTypeMutationResult> {
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
		| NotificationTypeMutationResult
		| { readonly error: string; readonly reason?: string; readonly message?: string };

	if (!response.ok || !('txid' in result)) {
		throw commandErrorFrom(response, result, 'Unable to save notification type.');
	}

	return result;
}

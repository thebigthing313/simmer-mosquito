import type { ProfileRow } from '@simmer-mosquito/sync';

export function createProfileMutationHandlers(options: { readonly serverUrl: string }) {
	return {
		onInsert: async ({ transaction }: CollectionMutationHandlerInput<ProfileRow>) => {
			const txids = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const result = await writeProfile(
						`${options.serverUrl}/organization/profiles`,
						'POST',
						toProfilePayload(mutation.modified),
					);
					return result.txid;
				}),
			);

			return { txid: txids };
		},
		onUpdate: async ({ transaction }: CollectionMutationHandlerInput<ProfileRow>) => {
			const txids = await Promise.all(
				transaction.mutations.map(async (mutation) => {
					const row = mutation.modified;
					const result = await writeProfile(
						`${options.serverUrl}/organization/profiles/${row.id}`,
						'PATCH',
						toProfilePayload(row),
					);
					return result.txid;
				}),
			);

			return { txid: txids };
		},
	};
}

export async function inviteOrganizationProfile(
	serverUrl: string,
	input: {
		readonly email: string;
		readonly displayName: string;
		readonly role: string;
		readonly profileId: string | null;
	},
): Promise<void> {
	const response = await fetch(`${serverUrl}/organization/invitations`, {
		method: 'POST',
		credentials: 'include',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
		},
		body: JSON.stringify(input),
	});
	const result = (await response.json()) as
		| { readonly txid: number }
		| { readonly error: string; readonly reason?: string; readonly message?: string };

	if (!response.ok || !('txid' in result)) {
		throw new Error(
			'reason' in result && typeof result.reason === 'string'
				? result.reason
				: 'message' in result && typeof result.message === 'string'
					? result.message
					: 'Unable to send invitation.',
		);
	}
}

interface CollectionMutationHandlerInput<TRow> {
	readonly transaction: {
		readonly mutations: readonly {
			readonly original: Partial<TRow>;
			readonly modified: TRow;
		}[];
	};
}

interface ProfileMutationResult {
	readonly txid: number;
}

function toProfilePayload(row: ProfileRow) {
	return {
		id: row.id,
		displayName: row.displayName,
		isActive: row.isActive,
	};
}

async function writeProfile(
	url: string,
	method: 'POST' | 'PATCH',
	body: unknown,
): Promise<ProfileMutationResult> {
	const response = await fetch(url, {
		method,
		credentials: 'include',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
		},
		body: JSON.stringify(body),
	});
	const result = (await response.json()) as
		| ProfileMutationResult
		| { readonly error: string; readonly reason?: string; readonly message?: string };

	if (!response.ok || !('txid' in result)) {
		throw new Error(
			'reason' in result && typeof result.reason === 'string'
				? result.reason
				: 'message' in result && typeof result.message === 'string'
					? result.message
					: 'Unable to save profile.',
		);
	}

	return result;
}

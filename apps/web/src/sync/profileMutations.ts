import { createRowPayloadMapper, type ProfileRow } from '@simmer-mosquito/sync';
import type { AdminMembership, SimmerRole } from '../auth';
import { commandErrorFrom, readResponseBody } from './command-error';

const mapProfilePayload = createRowPayloadMapper<ProfileRow>([
	'id',
	'displayName',
	'isActive',
] as const);

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
	const result = (await readResponseBody(response)) as
		| { readonly txid: number }
		| { readonly error: string; readonly reason?: string; readonly message?: string };

	if (!response.ok || !('txid' in result)) {
		throw commandErrorFrom(response, result, 'Unable to send invitation.');
	}
}

export async function updateOrganizationMembershipRole(
	serverUrl: string,
	membershipId: string,
	role: SimmerRole,
): Promise<AdminMembership> {
	const response = await fetch(`${serverUrl}/organization/memberships/${membershipId}/role`, {
		method: 'PATCH',
		credentials: 'include',
		headers: {
			accept: 'application/json',
			'content-type': 'application/json',
		},
		body: JSON.stringify({ role }),
	});
	const result = (await readResponseBody(response)) as
		| { readonly membership: AdminMembership; readonly txid: number }
		| { readonly error: string; readonly reason?: string; readonly message?: string };

	if (!response.ok || !('membership' in result)) {
		throw commandErrorFrom(response, result, 'Unable to update role.');
	}

	return result.membership;
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
	return mapProfilePayload(row);
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
	const result = (await readResponseBody(response)) as
		| ProfileMutationResult
		| { readonly error: string; readonly reason?: string; readonly message?: string };

	if (!response.ok || !('txid' in result)) {
		throw commandErrorFrom(response, result, 'Unable to save profile.');
	}

	return result;
}

import type { AuthFetch } from '../fetch-types.js';
import type { InvitationLookup } from '../outcomes.js';

export async function fetchInvitation(
	authFetch: AuthFetch,
	token: string,
): Promise<InvitationLookup | null> {
	const response = await authFetch(`/auth/invitation?token=${encodeURIComponent(token)}`);
	const data = (await response.json().catch(() => ({}))) as {
		readonly invitation?: InvitationLookup | null;
	};
	return data.invitation ?? null;
}

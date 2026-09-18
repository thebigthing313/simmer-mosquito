import type { AuthFetch } from '../fetch-types.js';
import type { InvitationLookup } from '../outcomes.js';
import type { InvitationLookupBody } from '../wire.js';

export async function fetchInvitation(
	authFetch: AuthFetch,
	token: string,
): Promise<InvitationLookup | null> {
	const response = await authFetch(`/auth/invitation?token=${encodeURIComponent(token)}`);
	const body = (await response.json().catch(() => ({}))) as Partial<
		Extract<InvitationLookupBody, { readonly ok: true }>
	>;
	return body.invitation ?? null;
}

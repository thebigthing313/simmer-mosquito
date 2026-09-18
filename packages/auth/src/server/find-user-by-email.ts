import type { WorkOsClient } from './workos-client.js';

/**
 * The WorkOS user with exactly this email, or `null`. `lastSignInAt` tells a
 * used account from an invitation's never-signed-in placeholder.
 */
export async function findUserByEmail(
	workos: WorkOsClient,
	email: string,
): Promise<{ readonly id: string; readonly lastSignInAt: string | null } | null> {
	const normalized = email.trim().toLowerCase();
	const result = await workos.userManagement.listUsers({ email: normalized, limit: 1 });
	const match = result.data.find((user) => user.email.trim().toLowerCase() === normalized);
	if (match === undefined) {
		return null;
	}

	return { id: match.id, lastSignInAt: match.lastSignInAt ?? null };
}

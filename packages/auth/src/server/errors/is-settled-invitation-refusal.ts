/**
 * Whether a revoke was refused because nothing was left to revoke: 404 for an
 * unknown invitation, 400 for one already accepted, expired or revoked.
 */
export function isSettledInvitationRefusal(error: unknown): boolean {
	const status = (error as { readonly status?: unknown } | null)?.status;
	return status === 400 || status === 404;
}

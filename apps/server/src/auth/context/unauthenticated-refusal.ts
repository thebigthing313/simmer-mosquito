import type { AuthContextResult } from './auth-context.js';

/** The 401 every door answers a session it could not verify with, so the body is built in one place. */
export function unauthenticatedRefusal(reason: string): Extract<AuthContextResult, { ok: false }> {
	return { ok: false, status: 401, error: { type: 'unauthenticated', reason } };
}

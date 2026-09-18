import type { UnauthenticatedSession } from './session-authentication.js';

/**
 * A thrown refresh error as a refusal, or `null` when WorkOS could not be
 * asked. A 4xx other than 429 is a membership decision; a timeout, 5xx or rate
 * limit is not, and the caller rethrows it.
 */
export function asSwitchRefusal(error: unknown): UnauthenticatedSession | null {
	const failure = error as { readonly status?: unknown; readonly error?: unknown } | null;
	const status = typeof failure?.status === 'number' ? failure.status : 0;
	if (status < 400 || status >= 500 || status === 429) {
		return null;
	}

	const code = failure?.error;
	return {
		authenticated: false,
		reason: typeof code === 'string' && code.trim() !== '' ? code : 'organization_switch_refused',
	};
}

import type { AuthContextError } from './auth-context.js';

/**
 * What each refusal says to the person who met it, one sentence per arm, each
 * naming its fix. Keyed by {@link AuthContextError}, so a fourth refusal owes
 * a sentence here.
 */
export const AUTH_REFUSAL_SENTENCES: Record<AuthContextError['type'], string> = {
	unauthenticated: 'Your session has ended. Sign in again to continue.',
	organization_required: 'This session has no Organization selected. Choose one to continue.',
	membership_required:
		'This Account holds no active Membership in the selected Organization. Ask an Organization owner for access.',
};

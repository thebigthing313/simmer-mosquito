import type { WorkOsAuthContext } from './workos-auth-context.js';

export function loadSealedSession(context: WorkOsAuthContext, sealedSession: string) {
	return context.workos.userManagement.loadSealedSession({
		sessionData: sealedSession,
		cookiePassword: context.config.cookiePassword,
	});
}

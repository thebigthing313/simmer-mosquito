import type { WorkOsAuthContext } from '../workos-auth-context.js';

export function getAuthorizationUrl(context: WorkOsAuthContext): string {
	return context.workos.userManagement.getAuthorizationUrl({
		provider: 'authkit',
		redirectUri: context.config.redirectUri,
		clientId: context.config.clientId,
	});
}

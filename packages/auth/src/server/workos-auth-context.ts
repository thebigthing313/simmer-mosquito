import type { WorkOsAuthConfig } from './workos-auth-config.js';
import type { WorkOsClient } from './workos-client.js';

/** What every method of the WorkOS boundary is called with. */
export interface WorkOsAuthContext {
	readonly workos: WorkOsClient;
	readonly config: WorkOsAuthConfig;
}

/** The `session` option that asks WorkOS to return a sealed session. */
export function sealSessionOptions(config: WorkOsAuthConfig): {
	readonly sealSession: true;
	readonly cookiePassword: string;
} {
	return { sealSession: true, cookiePassword: config.cookiePassword };
}

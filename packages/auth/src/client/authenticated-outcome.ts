import type { AuthJsonBody } from './create-auth-json-post.js';
import type { AuthenticatedOutcome } from './outcomes.js';

export function authenticatedOutcome(data: AuthJsonBody): AuthenticatedOutcome {
	return { status: 'authenticated', organizationRequired: data.organizationRequired === true };
}

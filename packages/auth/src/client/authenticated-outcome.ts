import type { AuthenticatedOutcome } from './outcomes.js';
import type { AuthenticatedBody } from './wire.js';

export function authenticatedOutcome(body: AuthenticatedBody): AuthenticatedOutcome {
	return { status: 'authenticated', organizationRequired: body.organizationRequired === true };
}

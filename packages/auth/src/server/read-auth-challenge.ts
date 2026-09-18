import type { AuthChallenge } from '../client/wire.js';
import { readErrorCode } from './errors/read-error-code.js';
import { readRawData } from './errors/read-raw-data.js';
import { readOrganizationChoices } from './read-organization-choices.js';

/**
 * A WorkOS further-step challenge read off a rejected authenticate call, or
 * `null` when the error is not one.
 */
export function readAuthChallenge(error: unknown, fallbackEmail: string): AuthChallenge | null {
	const raw = readRawData(error);
	if (raw === undefined) {
		return null;
	}

	const code = readErrorCode(error);
	const token = raw.pending_authentication_token;
	if (typeof token !== 'string') {
		return null;
	}

	if (code === 'email_verification_required') {
		const email = typeof raw.email === 'string' ? raw.email : fallbackEmail;
		return { status: 'verification_required', pendingAuthenticationToken: token, email };
	}

	if (code === 'organization_selection_required') {
		return {
			status: 'organization_selection_required',
			pendingAuthenticationToken: token,
			organizations: readOrganizationChoices(raw.organizations),
		};
	}

	return null;
}

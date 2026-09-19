import type { ActiveLocalAuthIdentity } from '@simmer-mosquito/db';

export interface LocalAuthIdentityResolver {
	resolveActiveLocalAuthIdentity(input: {
		readonly workosUserId: string;
		readonly workosOrganizationId: string;
	}): Promise<ActiveLocalAuthIdentity | null>;
}

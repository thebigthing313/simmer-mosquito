import type { AuthUser } from '@simmer-mosquito/auth';
import type { ActiveLocalAuthIdentity } from '@simmer-mosquito/db';
import type { AuthContext } from '../context/auth-context.js';

export interface AuthVariables {
	readonly authContext: AuthContext;
	readonly operatorContext: OperatorAuthContext;
}

export interface OperatorAuthContext {
	readonly workosUser: AuthUser;
	readonly workosOrganizationId: string | null;
	readonly workosSessionId: string | null;
	readonly workosRole: string | null;
	readonly localIdentity: ActiveLocalAuthIdentity | null;
}

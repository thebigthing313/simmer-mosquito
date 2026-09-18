import type { AuthUser } from '@simmer-mosquito/auth';
import type { ActiveLocalAuthIdentity, SimmerRole } from '@simmer-mosquito/db';

export interface AuthContext {
	readonly workosUser: AuthUser;
	readonly workosOrganizationId: string;
	readonly workosSessionId: string | null;
	readonly workosRole: string | null;
	readonly user: ActiveLocalAuthIdentity['user'];
	readonly organization: ActiveLocalAuthIdentity['organization'];
	readonly profile: ActiveLocalAuthIdentity['profile'];
	readonly membership: ActiveLocalAuthIdentity['membership'];
	readonly role: SimmerRole;
	/**
	 * The organization's IANA timezone, the authority for which calendar day a
	 * timestamped record belongs to. On the context because every date-bounded
	 * read needs it and the map-tile path cannot afford a second query.
	 */
	readonly timeZone: string;
	/**
	 * Whether this session is signed in as SIMMER rather than as an
	 * organization: the selected WorkOS organization is the operator one.
	 * Operators hold ordinary memberships too (ADR 0011), so a role alone cannot
	 * say. `false` when `SIMMER_OPERATOR_ORG_ID` is unset.
	 */
	readonly isOperator: boolean;
}

export type AuthContextError =
	| {
			readonly type: 'unauthenticated';
			readonly reason: string;
	  }
	| {
			readonly type: 'organization_required';
			readonly reason: string;
	  }
	| {
			readonly type: 'membership_required';
			readonly reason: string;
			readonly workosOrganizationId: string;
	  };

export type AuthContextResult =
	| {
			readonly ok: true;
			readonly context: AuthContext;
			readonly sealedSession?: string;
	  }
	| {
			readonly ok: false;
			readonly status: 401 | 403;
			readonly error: AuthContextError;
			readonly sealedSession?: string;
	  };

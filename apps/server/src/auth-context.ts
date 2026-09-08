import type {
	AuthUser,
	SessionAuthenticationOptions,
	SessionAuthenticationResult,
	WorkOsAuth,
} from '@simmer-mosquito/auth';
import type { AuthenticatedMe, RefusedMeBody } from '@simmer-mosquito/auth/browser';
import type { ActiveLocalAuthIdentity, SimmerRole } from '@simmer-mosquito/db';
import { resolveOrganizationSettings } from '@simmer-mosquito/domain';

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
	 * The organization's IANA timezone — the authority for which calendar day a
	 * timestamped record belongs to.
	 *
	 * On the context rather than fetched per read because *every* date-bounded
	 * read needs it and the map-tile path cannot afford a second query for it.
	 * Resolved through the domain, so a missing or unparseable setting lands on
	 * `DEFAULT_ORGANIZATION_TIMEZONE` rather than on the database server's zone.
	 */
	readonly timeZone: string;
	/**
	 * Whether this session is signed in **as SIMMER** rather than as an
	 * organization.
	 *
	 * The same test `createOperatorAuthContextMiddleware` makes — the selected
	 * WorkOS organization is the operator organization — resolved once here so
	 * that a route serving both kinds of caller can ask without a second query or
	 * a second middleware.
	 *
	 * It exists because operators hold an ordinary organization membership too
	 * (ADR 0011), so a role alone cannot tell an operator from an organization
	 * admin. A command that only SIMMER may send says so through
	 * `CommandPermission`'s `operator` kind, and that kind reads this.
	 *
	 * `false` when `SIMMER_OPERATOR_ORG_ID` is unset, which is the safe reading:
	 * an unconfigured deployment has no operators rather than all of them.
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

/**
 * The per-request session check, as a seam rather than as a view.
 *
 * Its own interface and not a `Pick<WorkOsAuth, 'authenticateSession'>`, because
 * `dev-impersonation.ts` implements it without being a WorkOS client at all and
 * `main.ts` threads it separately from `auth` for that reason. The assertion
 * below is what keeps the two shapes in step anyway.
 */
export interface AuthSessionProvider {
	authenticateSession(
		sealedSession: string | undefined,
		options: SessionAuthenticationOptions,
	): Promise<SessionAuthenticationResult>;
}

/**
 * Errors with the method name when the real WorkOS client stops fitting the seam.
 *
 * Deliberately the same three lines as in `packages/auth/src/index.ts` and in the
 * generated drift suite at
 * `packages/sync/src/tests/unit/collections/tables/drift.test.ts`, because a shared
 * export was considered and refused: the idiom has no runtime and exporting it would
 * put a dependency edge between packages that need nothing else from each other (#716).
 */
type Assert<T extends never> = T;
type _WorkOsAuthIsASessionProvider = Assert<
	WorkOsAuth extends AuthSessionProvider ? never : 'authenticateSession'
>;

export interface LocalAuthIdentityResolver {
	resolveActiveLocalAuthIdentity(input: {
		readonly workosUserId: string;
		readonly workosOrganizationId: string;
	}): Promise<ActiveLocalAuthIdentity | null>;
}

export async function resolveAuthContext(options: {
	readonly sealedSession: string | undefined;
	readonly auth: AuthSessionProvider;
	readonly localIdentityResolver: LocalAuthIdentityResolver;
	/** `null` when unconfigured, which resolves `isOperator` to `false`. */
	readonly operatorOrganizationId?: string | null;
	/**
	 * Whether this caller may spend the session's refresh token.
	 *
	 * Stated at every call site rather than defaulted, because the wrong default
	 * is what #298 was: `/auth/me` is the one caller that may, and a route added
	 * later must decide rather than inherit.
	 */
	readonly mayRefresh: boolean;
}): Promise<AuthContextResult> {
	const session = await options.auth.authenticateSession(options.sealedSession, {
		mayRefresh: options.mayRefresh,
	});

	if (!session.authenticated) {
		return {
			ok: false,
			status: 401,
			error: {
				type: 'unauthenticated',
				reason: session.reason,
			},
		};
	}

	if (session.workosOrganizationId === null) {
		return {
			ok: false,
			status: 403,
			error: {
				type: 'organization_required',
				reason: 'WorkOS session has no selected organization.',
			},
			...(session.sealedSession === undefined ? {} : { sealedSession: session.sealedSession }),
		};
	}

	const localIdentity = await options.localIdentityResolver.resolveActiveLocalAuthIdentity({
		workosUserId: session.user.workosUserId,
		workosOrganizationId: session.workosOrganizationId,
	});

	if (localIdentity === null) {
		return {
			ok: false,
			status: 403,
			error: {
				type: 'membership_required',
				reason: 'No active SIMMER membership/profile exists for selected organization.',
				workosOrganizationId: session.workosOrganizationId,
			},
			...(session.sealedSession === undefined ? {} : { sealedSession: session.sealedSession }),
		};
	}

	return {
		ok: true,
		context: {
			workosUser: session.user,
			workosOrganizationId: session.workosOrganizationId,
			workosSessionId: session.sessionId,
			workosRole: session.role,
			user: localIdentity.user,
			organization: localIdentity.organization,
			profile: localIdentity.profile,
			membership: localIdentity.membership,
			role: localIdentity.membership.role,
			timeZone: resolveOrganizationSettings(localIdentity.organization.settings).settings.timezone,
			isOperator:
				options.operatorOrganizationId != null &&
				session.workosOrganizationId === options.operatorOrganizationId,
		},
		...(session.sealedSession === undefined ? {} : { sealedSession: session.sealedSession }),
	};
}

/**
 * The refusal body, whose type `packages/auth` owns.
 *
 * Annotated for the reason {@link toAuthMeBody} is, on the other arm of the
 * same endpoint. Inferred, it put `error` on the wire while `UnauthenticatedMe`
 * declared only `authenticated` and `reason`, so a rename on either side
 * compiled on both and the field arrived `undefined` at every read site. That
 * is the case #615 closed for the authenticated arm and left open here (#698).
 *
 * It also holds {@link AuthContextError} to the three refusals the clients
 * name: a fourth kind, or a renamed one, fails here rather than reaching a
 * client as a string nothing matches.
 */
export function toAuthFailureBody(
	result: Extract<AuthContextResult, { ok: false }>,
): RefusedMeBody {
	return {
		authenticated: false,
		error: result.error.type,
		reason: result.error.type === 'unauthenticated' ? result.error.reason : result.error.type,
	};
}

/**
 * The `/auth/me` body with every field of it present.
 *
 * `LocalIdentity` in `packages/auth` makes `organizationName` and
 * `organizationSlug` optional, so {@link AuthenticatedMe} on its own refuses a
 * renamed field and accepts a deleted one. That is half of the case #615 opens
 * on, and `Required` is what closes it.
 *
 * Tightened on the producer rather than on the client declaration, which stays
 * as it is: a reader parses a body it did not build and has to tolerate one
 * that omits them, while the one thing that builds the body is held to all
 * seven. Derived from `AuthenticatedMe` rather than naming the fields, so this
 * cannot become the third copy of the shape.
 */
type CompleteAuthMe = AuthenticatedMe & {
	readonly localIdentity: Required<AuthenticatedMe['localIdentity']>;
};

/**
 * The `/auth/me` body, whose type `packages/auth` owns.
 *
 * Annotated rather than inferred because this function is the only producer of
 * a contract three front ends read: 72 non-test modules under `apps/web`,
 * `apps/admin` and `apps/mobile` name `localIdentity`, one of them
 * `readOrgRole` in `apps/web/src/lib/write-access.ts`, the gate deciding
 * whether the UI offers a write action at all. While the type was inferred here
 * and written out by hand in `packages/auth`, renaming a field on this side
 * compiled on both, and the field arrived `undefined` at every read site.
 *
 * {@link AuthenticatedMe} comes from `@simmer-mosquito/auth/browser` because
 * the client half already lived there and moving it would buy a nicer import
 * name for real churn. Reaching that subpath from the server costs nothing: it
 * resolves to source rather than `dist/`, so it owes no `fallow` condition,
 * `apps/server` already depends on the package and references it in tsconfig,
 * and the module touches no DOM. Its own docblock says the `browser` name is
 * historical.
 */
export function toAuthMeBody(authContext: AuthContext): CompleteAuthMe {
	return {
		authenticated: true,
		user: authContext.workosUser,
		workosOrganizationId: authContext.workosOrganizationId,
		localIdentity: {
			userId: authContext.user.id,
			organizationId: authContext.organization.id,
			organizationName: authContext.organization.name,
			organizationSlug: authContext.organization.slug,
			profileId: authContext.profile.id,
			membershipId: authContext.membership.id,
			role: authContext.role,
		},
	};
}

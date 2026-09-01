import type { ErrorHandler } from 'hono';

/**
 * Staging performs no WorkOS identity writes.
 *
 * Staging authenticates against WorkOS **production**, so every call this server
 * makes to WorkOS from staging reaches the same directory production reaches.
 * A stray `sendOrganizationInvitation` mails a real address, a stray
 * `deactivateOrganizationMembership` revokes somebody's real access, and a stray
 * `requestPasswordReset` mails a working reset link for a production account
 * from code that has not shipped. The rule that stops all three is stated at the
 * WorkOS boundary: nothing that changes durable identity state runs, and session
 * operations are carved out by name so signing in still works.
 *
 * The seam is the single `auth` object `main.ts` builds, which every route and
 * every command already receives, following the provider swap
 * `dev-impersonation.ts` makes at the same seam.
 *
 * It is an **allowlist**, and that is the load-bearing choice. A list of the
 * eight writes that exist today is one `packages/auth` addition away from
 * silently mailing production from staging; an allowlist refuses a method
 * nobody has thought about yet. See #376 for the decision and #386 for the
 * build.
 */

/**
 * The methods that still run with the interlock on.
 *
 * The line is durable identity state versus session state.
 * `signInWithPassword` and `revokeSession` both write, but what they write is a
 * session. `getOrganization`, `findOrganizationMember` and `listUsers` write
 * nothing at all.
 *
 * `verifyEmailCode` is the one judgement call, and it is allowed. It marks an
 * address verified, which is durable, but it is reachable only as the second
 * step of a sign-in WorkOS itself asked for, and refusing it would strand a
 * signing-in user mid-flow. Nobody new can reach it on staging anyway, because
 * `signUpWithPassword` and `acceptInvitationWithPassword` are both refused.
 *
 * Everything else on the `auth` object refuses:
 * `signUpWithPassword`, `acceptInvitationWithPassword`, `requestPasswordReset`,
 * `resetPassword`, `createOrganization`, `sendOrganizationInvitation`,
 * `revokeInvitation` and `deactivateOrganizationMembership`. They are not listed
 * here, on purpose: the allowlist is the whole declaration, and a ninth write
 * added later is refused without anybody remembering to name it.
 */
const SESSION_AND_READ_METHODS: ReadonlySet<string> = new Set([
	'getAuthorizationUrl',
	'authenticateCode',
	'authenticateSession',
	'switchOrganization',
	'signInWithPassword',
	'verifyEmailCode',
	'authenticateWithOrganizationSelection',
	'getInvitationByToken',
	'getLogoutUrl',
	'revokeSession',
	'getOrganization',
	'findOrganizationMember',
	'listUsers',
]);

/** The one code every refused surface answers with. */
export const WORKOS_IDENTITY_WRITES_DISABLED = 'workos_identity_writes_disabled';

/**
 * The one message every refused surface answers with.
 *
 * One message rather than five, so somebody who meets it on the People page and
 * again on the password reset form recognises it as the same rule. #380's
 * environment banner repeats it word for word, so it is read before it is met.
 */
export const WORKOS_IDENTITY_WRITES_DISABLED_MESSAGE =
	'Staging does not allow changes to sign-in accounts, Memberships, roles, Agencies, or invitations.';

/** The 403 body, in the `error` / `reason` shape every other refusal uses. */
export function workOsIdentityWritesDisabledBody(): {
	readonly error: string;
	readonly reason: string;
} {
	return {
		error: WORKOS_IDENTITY_WRITES_DISABLED,
		reason: WORKOS_IDENTITY_WRITES_DISABLED_MESSAGE,
	};
}

/**
 * A refused WorkOS identity write.
 *
 * Carries the method name for the log and not for the browser: which WorkOS
 * call a request would have made is a detail of this server, and #220 keeps
 * those out of a response.
 */
export class WorkOsIdentityWritesDisabledError extends Error {
	constructor(readonly method: string) {
		super(WORKOS_IDENTITY_WRITES_DISABLED_MESSAGE);
		this.name = 'WorkOsIdentityWritesDisabledError';
	}
}

/** Set on the wrapped object so callers can ask without being handed the flag. */
const INTERLOCKED = Symbol('workosIdentityWritesDisabled');

/**
 * Wrap the `auth` object so every identity write refuses.
 *
 * A `Proxy` rather than an object literal of the allowed methods, because the
 * literal would have to be edited every time `packages/auth` grows a method,
 * and the one that got forgotten would be a real WorkOS write running on
 * staging. Non-function properties and symbol keys pass straight through; a
 * string-keyed method outside the allowlist becomes a throw.
 */
export function withoutWorkOsIdentityWrites<TAuth extends object>(auth: TAuth): TAuth {
	return new Proxy(auth, {
		get(target, property, receiver): unknown {
			if (property === INTERLOCKED) {
				return true;
			}

			const value = Reflect.get(target, property, receiver);
			if (typeof value !== 'function') {
				return value;
			}

			if (typeof property !== 'string' || SESSION_AND_READ_METHODS.has(property)) {
				return value.bind(target);
			}

			return () => {
				throw new WorkOsIdentityWritesDisabledError(property);
			};
		},
	});
}

/**
 * Whether this `auth` object refuses identity writes.
 *
 * The wrapper is the one source of truth, so a caller that needs to refuse
 * *before* it starts work asks the object rather than reading the environment a
 * second time. Two readings of one variable is how a guard clause and the thing
 * it guards drift apart.
 */
export function workOsIdentityWritesDisabled(auth: object): boolean {
	return (auth as Record<symbol, unknown>)[INTERLOCKED] === true;
}

/**
 * Turn a refused write into the 403.
 *
 * An `app.onError` rather than a middleware, because a middleware never sees
 * it: `compose` catches a handler's throw at the dispatch that raised it and
 * hands it to `onError` there, so nothing propagates back up through
 * `await next()`. Running at that level is also what keeps the CORS headers on
 * the refusal, since the surrounding `cors()` resumes normally and still sets
 * them.
 *
 * It reaches every surface at once: a route that calls WorkOS directly, and a
 * command whose `handleCommandError` rethrows an error no domain declared.
 * Everything else falls through to Hono's own handling, unchanged.
 *
 * 403 rather than 503, because the refusal is a permanent property of the
 * environment and 503 invites a retry that will never work.
 */
export function workOsIdentityWriteErrorHandler(): ErrorHandler {
	return (error, context) => {
		if (!(error instanceof WorkOsIdentityWritesDisabledError)) {
			// Hono's own default, which taking `onError` replaces.
			if ('getResponse' in error) {
				const response = (error as { getResponse: () => Response }).getResponse();
				return context.newResponse(response.body, response);
			}

			console.error(error);
			return context.text('Internal Server Error', 500);
		}

		console.warn(
			`[workos-interlock] refused ${error.method} — WORKOS_IDENTITY_WRITES_DISABLED is set.`,
		);

		return context.json(workOsIdentityWritesDisabledBody(), 403);
	};
}

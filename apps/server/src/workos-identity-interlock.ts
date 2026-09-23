import type { WorkOsAuth } from '@simmer-mosquito/auth';
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
 * operations still run so signing in works.
 *
 * The seam is the single `auth` object `main.ts` builds, which every route and
 * every command already receives, following the provider swap
 * `dev-impersonation.ts` makes at the same seam.
 *
 * The classification is the shape of {@link WorkOsAuth}: `session` holds the
 * calls that run here and `identity` holds the ones that do not, and a method
 * is classified by which half `packages/auth` declares it on. There is no list
 * of names to keep in step, which is what #619 found had drifted; the whole
 * `identity` half refuses, so a ninth write added there is refused without
 * anybody naming it here. See #376 for the decision and #386 for the build.
 */

/** The one code every refused surface answers with. */
export const WORKOS_IDENTITY_WRITES_DISABLED = 'workos_identity_writes_disabled';

/**
 * The one message every refused surface answers with, so somebody who meets it
 * on the People page and again on the password reset form recognises the same
 * rule. #380's environment banner repeats it word for word.
 */
export const WORKOS_IDENTITY_WRITES_DISABLED_MESSAGE =
	'Staging does not allow changes to sign-in accounts, Memberships, roles, Organizations, or invitations.';

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
 * A refused WorkOS identity write. Carries the method name for the log and not
 * for the browser: which WorkOS call a request would have made is a detail of
 * this server, and #220 keeps those out of a response.
 */
export class WorkOsIdentityWritesDisabledError extends Error {
	constructor(readonly method: string) {
		super(WORKOS_IDENTITY_WRITES_DISABLED_MESSAGE);
		this.name = 'WorkOsIdentityWritesDisabledError';
	}
}

/** Set on the wrapped halves so callers can ask without being handed the flag. */
const INTERLOCKED = Symbol('workosIdentityWritesDisabled');

/**
 * The `auth` object with every identity write refusing and the session half
 * untouched.
 *
 * The identity half is a `Proxy` that refuses every string-keyed method rather
 * than an object literal of the methods to refuse, so `packages/auth` growing a
 * write changes nothing here. Non-function properties and symbol keys pass
 * through, because `then` is read on any awaited value and a wrapper answering
 * every key with a function would look thenable.
 */
export function withoutWorkOsIdentityWrites<
	TAuth extends {
		readonly session: object;
		readonly identity: object;
	},
>(auth: TAuth): TAuth {
	const identity = new Proxy(auth.identity, {
		get(target, property, receiver): unknown {
			if (property === INTERLOCKED) {
				return true;
			}

			const value = Reflect.get(target, property, receiver);
			if (typeof value !== 'function' || typeof property !== 'string') {
				return value;
			}

			return () => {
				throw new WorkOsIdentityWritesDisabledError(property);
			};
		},
	});

	return { ...auth, identity, [INTERLOCKED]: true };
}

/**
 * Whether this object refuses identity writes. Answers for the whole `auth`
 * object and for its `identity` half alike, since a command that holds only
 * the half asks it before writing Postgres.
 *
 * The wrapper is the one source of truth, so a caller that needs to refuse
 * before it starts work asks the object rather than reading the environment a
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
			`[workos-interlock] refused ${error.method}: WORKOS_IDENTITY_WRITES_DISABLED is set.`,
		);

		return context.json(workOsIdentityWritesDisabledBody(), 403);
	};
}

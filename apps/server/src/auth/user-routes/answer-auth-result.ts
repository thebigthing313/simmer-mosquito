import type { AuthChallenge, AuthenticatedSession } from '@simmer-mosquito/auth';
import type { ChallengeBody, RefusedStatus, WireBody } from '@simmer-mosquito/auth/browser';
import type { AuthRouteContext, FinalizeWorkOsSession } from './auth-user-flows.js';
import { respondAuthenticated } from './respond-authenticated.js';
import { weakPasswordBody } from './weak-password-body.js';

/**
 * The HTTP status each refused outcome answers with, one entry per status a
 * wire body can carry that is not a challenge or a payload fault. A refusal
 * the table does not name fails `tsc` at the call that would answer it.
 */
const REFUSAL_HTTP_STATUS = {
	invalid_credentials: 401,
	email_taken: 409,
	account_exists: 409,
	weak_password: 422,
	invalid_code: 400,
	invalid_selection: 400,
	invalid_token: 400,
	invalid_invitation: 400,
} as const;

type TabledStatus = keyof typeof REFUSAL_HTTP_STATUS;

type OkArm<TBody extends WireBody> = Extract<TBody, { readonly ok: true }>;

/**
 * What a WorkOS flow answered, as the endpoint answers it. Every status must
 * be one the endpoint's body type carries and the table above prices, so a
 * result status added in `packages/auth` and not on the wire, or on the wire
 * and not in the table, fails here rather than reaching the client as its
 * `error` arm.
 */
export type AuthFlowResult<TBody extends WireBody> =
	| (OkArm<TBody> extends { readonly organizationRequired: boolean }
			? { readonly status: 'authenticated'; readonly session: AuthenticatedSession }
			: { readonly status: 'ok' })
	| Extract<AuthChallenge, { readonly status: RefusedStatus<TBody> }>
	| ('weak_password' extends RefusedStatus<TBody>
			? { readonly status: 'weak_password'; readonly message: string }
			: never)
	| { readonly status: Exclude<RefusedStatus<TBody> & TabledStatus, 'weak_password'> };

/**
 * Answer a flow's result: a session through `finalizeSession`, a challenge
 * as its 200 body, and every refusal as `{ ok: false, status }` at the code the
 * table gives it, with `weak_password` carrying WorkOS's sentence.
 */
export function answerAuthResult<TBody extends WireBody>(
	context: AuthRouteContext,
	finalizeSession: FinalizeWorkOsSession,
	result: AuthFlowResult<TBody>,
) {
	return answer(context, finalizeSession, result);
}

/** Every result any flow can answer; the generic above holds each endpoint to its own subset. */
type AnyFlowResult =
	| { readonly status: 'authenticated'; readonly session: AuthenticatedSession }
	| { readonly status: 'ok' }
	| AuthChallenge
	| { readonly status: 'weak_password'; readonly message: string }
	| { readonly status: Exclude<TabledStatus, 'weak_password'> };

function answer(
	context: AuthRouteContext,
	finalizeSession: FinalizeWorkOsSession,
	result: AnyFlowResult,
) {
	switch (result.status) {
		case 'authenticated':
			return respondAuthenticated(context, finalizeSession, result.session);
		case 'ok':
			return context.json({ ok: true });
		case 'verification_required':
		case 'organization_selection_required':
			return context.json({ ok: false, ...result } satisfies ChallengeBody);
		case 'weak_password':
			return context.json(weakPasswordBody(result.message), REFUSAL_HTTP_STATUS.weak_password);
		default:
			return context.json({ ok: false, status: result.status }, REFUSAL_HTTP_STATUS[result.status]);
	}
}

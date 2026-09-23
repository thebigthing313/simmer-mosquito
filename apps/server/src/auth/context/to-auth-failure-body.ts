import type { RefusedMeBody } from '@simmer-mosquito/auth/browser';
import type { AuthContextResult } from './auth-context.js';
import { AUTH_REFUSAL_SENTENCES } from './auth-refusal-sentences.js';

/**
 * The refusal body every guarded route answers with. Annotated so a rename on
 * either side of the wire fails `tsc` (#615, #698). `error` is the code a
 * caller branches on, `reason` the sentence it may render, and `detail` the
 * session layer's own machine string, kept for a log (#795).
 */
export function toAuthFailureBody(
	result: Extract<AuthContextResult, { ok: false }>,
): RefusedMeBody {
	return {
		authenticated: false,
		error: result.error.type,
		reason: AUTH_REFUSAL_SENTENCES[result.error.type],
		...(result.error.type === 'unauthenticated' ? { detail: result.error.reason } : {}),
	};
}

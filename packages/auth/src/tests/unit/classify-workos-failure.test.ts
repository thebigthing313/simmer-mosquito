/**
 * The one reading of a thrown WorkOS error. Every method's `catch` switches on
 * what this answers, so the precedence between rules is pinned here rather than
 * in each method's suite: a password refused by policy is a 400 and a spent
 * reset token is a 404 (#54), and a code naming a token never reads as a
 * password refusal whatever the status.
 */

import { describe, expect, it } from 'vitest';

import { classifyWorkOsFailure } from '../../server/errors/classify-workos-failure.js';

function workOsError(
	name: string,
	status: number,
	extra: Record<string, unknown> = {},
): Error & Record<string, unknown> {
	const error = new Error(`${name} ${status}`) as Error & Record<string, unknown>;
	error.name = name;
	error.status = status;
	Object.assign(error, extra);
	return error;
}

describe('classifyWorkOsFailure', () => {
	it.each([
		[
			'a 400 password_strength_error',
			workOsError('BadRequestException', 400, { code: 'password_strength_error' }),
		],
		[
			'a 400 password_reset_error',
			workOsError('BadRequestException', 400, { code: 'password_reset_error' }),
		],
		[
			'a 422 whose errors[] name a password requirement',
			workOsError('UnprocessableEntityException', 422, {
				errors: [{ code: 'password_too_short', message: 'Use 10 or more characters.' }],
			}),
		],
	])('reads %s as a password refusal', (_label, error) => {
		expect(classifyWorkOsFailure(error).kind).toBe('password_policy');
	});

	it('carries the actionable message off errors[] for a password refusal', () => {
		const failure = classifyWorkOsFailure(
			workOsError('BadRequestException', 400, {
				code: 'password_reset_error',
				errors: [{ code: 'password_too_short', message: 'Use 10 or more characters.' }],
			}),
		);

		expect(failure).toEqual({ kind: 'password_policy', message: 'Use 10 or more characters.' });
	});

	it('never reads a 404 as a password refusal, whatever the code says', () => {
		const failure = classifyWorkOsFailure(
			workOsError('NotFoundException', 404, { code: 'password_reset_token_not_found' }),
		);

		expect(failure.kind).toBe('not_found');
	});

	it('never reads a code naming a token as a password refusal', () => {
		const failure = classifyWorkOsFailure(
			workOsError('BadRequestException', 400, { code: 'password_reset_token_expired' }),
		);

		expect(failure.kind).toBe('bad_request');
	});

	it('reads a challenge off the pending token, with the fallback email', () => {
		const failure = classifyWorkOsFailure(
			workOsError('OauthException', 422, {
				rawData: { error: 'email_verification_required', pending_authentication_token: 'pat_1' },
			}),
			{ fallbackEmail: 'a@b.test' },
		);

		expect(failure).toEqual({
			kind: 'challenge',
			challenge: {
				status: 'verification_required',
				pendingAuthenticationToken: 'pat_1',
				email: 'a@b.test',
			},
		});
	});

	it('reads an OauthException without a challenge as invalid credentials', () => {
		const failure = classifyWorkOsFailure(
			workOsError('OauthException', 401, { rawData: { error: 'invalid_credentials' } }),
		);

		expect(failure.kind).toBe('invalid_credentials');
	});

	it('puts an invalid invitation ahead of everything else', () => {
		const failure = classifyWorkOsFailure(
			workOsError('OauthException', 401, { rawData: { error: 'invitation_invalid' } }),
		);

		expect(failure.kind).toBe('invitation_invalid');
	});

	it.each(['email_not_available', 'email_taken'])('reads %s as a taken email', (code) => {
		expect(
			classifyWorkOsFailure(workOsError('UnprocessableEntityException', 422, { code })).kind,
		).toBe('email_taken');
	});

	it('falls back to the status alone', () => {
		expect(classifyWorkOsFailure(workOsError('UnprocessableEntityException', 422)).kind).toBe(
			'unprocessable',
		);
		expect(classifyWorkOsFailure(workOsError('BadRequestException', 400)).kind).toBe('bad_request');
		expect(classifyWorkOsFailure(workOsError('NotFoundException', 404)).kind).toBe('not_found');
	});

	it('answers unrecognized for anything else', () => {
		expect(classifyWorkOsFailure(new Error('socket hang up')).kind).toBe('unrecognized');
		expect(classifyWorkOsFailure(workOsError('InternalServerError', 500)).kind).toBe(
			'unrecognized',
		);
		expect(classifyWorkOsFailure(null).kind).toBe('unrecognized');
	});
});

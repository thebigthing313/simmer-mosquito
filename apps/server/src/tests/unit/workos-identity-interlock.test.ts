/**
 * The interlock that makes staging safe to point at WorkOS production.
 *
 * Two properties, and they are the two that stop the failures #376 found. The
 * wrapper is an allowlist, so a method nobody has classified refuses rather
 * than running; and the refusal reaches the caller as the one 403 rather than
 * as a 500 with a stack.
 */

import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import {
	WORKOS_IDENTITY_WRITES_DISABLED,
	WORKOS_IDENTITY_WRITES_DISABLED_MESSAGE,
	WorkOsIdentityWritesDisabledError,
	withoutWorkOsIdentityWrites,
	workOsIdentityWriteErrorHandler,
	workOsIdentityWritesDisabled,
} from '../../workos-identity-interlock.js';

/** The eight writes on the `auth` object, and the reason each one is a write. */
const IDENTITY_WRITES = [
	'signUpWithPassword',
	'acceptInvitationWithPassword',
	'requestPasswordReset',
	'resetPassword',
	'createOrganization',
	'sendOrganizationInvitation',
	'revokeInvitation',
	'deactivateOrganizationMembership',
] as const;

/** The session and read calls sign-in needs, which keep working. */
const SESSION_AND_READS = [
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
] as const;

describe('withoutWorkOsIdentityWrites', () => {
	it.each(IDENTITY_WRITES)('refuses %s', (method) => {
		const auth = fakeAuth();
		const wrapped = withoutWorkOsIdentityWrites(auth);

		expect(() => wrapped[method]()).toThrow(WorkOsIdentityWritesDisabledError);
		expect(auth[method]).not.toHaveBeenCalled();
	});

	it.each(SESSION_AND_READS)('passes %s through', async (method) => {
		const auth = fakeAuth();
		const wrapped = withoutWorkOsIdentityWrites(auth);

		await expect(wrapped[method]('argument')).resolves.toBe('called');
		expect(auth[method]).toHaveBeenCalledWith('argument');
	});

	// The whole reason it is an allowlist. A ninth WorkOS write added to
	// `packages/auth` is refused on staging without anybody remembering to name
	// it here, which is the failure a denylist would ship silently.
	it('refuses a method nobody has classified', () => {
		const wrapped = withoutWorkOsIdentityWrites({
			deleteEveryUser: vi.fn(),
		});

		expect(() => wrapped.deleteEveryUser()).toThrow(WorkOsIdentityWritesDisabledError);
	});

	it('names the refused method for the log', () => {
		const wrapped = withoutWorkOsIdentityWrites(fakeAuth());

		expect(() => wrapped.sendOrganizationInvitation()).toThrow(
			expect.objectContaining({ method: 'sendOrganizationInvitation' }),
		);
	});

	// `then` is read on any awaited value, so a wrapper that answered every
	// string key with a function would make the object look thenable and throw
	// from the await rather than from the call.
	it('leaves properties that are not methods alone', () => {
		const wrapped = withoutWorkOsIdentityWrites({ region: 'us' }) as {
			readonly region: string;
			readonly then?: unknown;
		};

		expect(wrapped.region).toBe('us');
		expect(wrapped.then).toBeUndefined();
	});

	it('answers whether it is the wrapped object', () => {
		const auth = fakeAuth();

		expect(workOsIdentityWritesDisabled(auth)).toBe(false);
		expect(workOsIdentityWritesDisabled(withoutWorkOsIdentityWrites(auth))).toBe(true);
	});
});

describe('workOsIdentityWriteErrorHandler', () => {
	it('answers a refused write with the one 403', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const app = new Hono();
		app.onError(workOsIdentityWriteErrorHandler());
		app.get('/invite', () => {
			throw new WorkOsIdentityWritesDisabledError('sendOrganizationInvitation');
		});

		const response = await app.request('/invite');

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toEqual({
			error: WORKOS_IDENTITY_WRITES_DISABLED,
			reason: WORKOS_IDENTITY_WRITES_DISABLED_MESSAGE,
		});
	});

	// Which WorkOS call a request would have made is a detail of this server,
	// and #220 keeps those out of a response.
	it('keeps the method name out of the body', async () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		const app = new Hono();
		app.onError(workOsIdentityWriteErrorHandler());
		app.get('/invite', () => {
			throw new WorkOsIdentityWritesDisabledError('sendOrganizationInvitation');
		});

		const body = await (await app.request('/invite')).text();

		expect(body).not.toContain('sendOrganizationInvitation');
	});

	it('leaves every other error to Hono', async () => {
		const app = new Hono();
		app.onError(workOsIdentityWriteErrorHandler());
		app.get('/boom', () => {
			throw new Error('something else');
		});

		expect((await app.request('/boom')).status).toBe(500);
	});
});

/** Every method the `auth` object carries, answering the same way. */
type AuthMethod = (typeof IDENTITY_WRITES)[number] | (typeof SESSION_AND_READS)[number];
type AuthCall = (...args: readonly unknown[]) => Promise<string>;

function fakeAuth(): Record<AuthMethod, ReturnType<typeof vi.fn<AuthCall>>> {
	const auth = {} as Record<AuthMethod, ReturnType<typeof vi.fn<AuthCall>>>;
	for (const method of [...IDENTITY_WRITES, ...SESSION_AND_READS]) {
		auth[method] = vi.fn<AuthCall>(async () => 'called');
	}
	return auth;
}

/**
 * The interlock that makes staging safe to point at WorkOS production.
 *
 * Two properties, and they are the two that stop the failures #376 found. The
 * wrapper is an allowlist, so a method nobody has classified refuses rather
 * than running; and the refusal reaches the caller as the one 403 rather than
 * as a 500 with a stack.
 *
 * It wraps a real `createWorkOsAuth` object rather than a double built from the
 * lists under test. The double this replaced iterated those lists to decide
 * which methods it carried, so its method set was the answer, and the thirteen
 * names it repeated included `listUsers`, which is a WorkOS SDK call and has
 * never been a method of this object (#619).
 *
 * The stubbed client below implements only the calls the session and read half
 * makes. That is the other half of the assertion: a write that reached WorkOS
 * would find nothing to call, so it cannot pass by answering quietly.
 *
 * It is handed to `createWorkOsAuth` rather than mocked into it (#714). The
 * binding used to be `vi.mock('@workos-inc/node')`, which keys on the resolved
 * module, so the SDK was a devDependency of this app for this file alone and
 * without the specifier resolving from here it bound nothing: the first run of
 * this suite reached the real WorkOS and came back with 401s, which most of the
 * cases below would have swallowed as a mapped refusal. An argument cannot miss
 * that way. `sdkCalls` stays, because which call arrived is still what says the
 * object was bound to its target rather than replaced by the throwing shim.
 */

import {
	createWorkOsAuth,
	WORKOS_IDENTITY_WRITE_METHODS,
	WORKOS_SESSION_AND_READ_METHODS,
	type WorkOsClient,
	type WorkOsSessionAndReadMethod,
} from '@simmer-mosquito/auth';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	WORKOS_IDENTITY_WRITES_DISABLED,
	WORKOS_IDENTITY_WRITES_DISABLED_MESSAGE,
	WorkOsIdentityWritesDisabledError,
	withoutWorkOsIdentityWrites,
	workOsIdentityWriteErrorHandler,
	workOsIdentityWritesDisabled,
} from '../../workos-identity-interlock.js';

/** Every WorkOS SDK call the object made, in order. */
const sdkCalls: string[] = [];

const authenticated = {
	user: { id: 'user_1', email: 'signed-in@example.test', emailVerified: true },
	organizationId: 'org_1',
	sealedSession: 'sealed',
};

function stubWorkOsClient(): WorkOsClient {
	const records =
		<TAnswer>(name: string, answer: TAnswer) =>
		(): TAnswer => {
			sdkCalls.push(name);
			return answer;
		};

	return {
		userManagement: {
			getAuthorizationUrl: records('getAuthorizationUrl', 'https://workos.test/authorize'),
			authenticateWithCode: records('authenticateWithCode', Promise.resolve(authenticated)),
			authenticateWithPassword: records('authenticateWithPassword', Promise.resolve(authenticated)),
			authenticateWithEmailVerification: records(
				'authenticateWithEmailVerification',
				Promise.resolve(authenticated),
			),
			authenticateWithOrganizationSelection: records(
				'authenticateWithOrganizationSelection',
				Promise.resolve(authenticated),
			),
			findInvitationByToken: records(
				'findInvitationByToken',
				Promise.resolve({
					id: 'invitation_1',
					email: 'invitee@example.test',
					state: 'pending',
					organizationId: 'org_1',
				}),
			),
			listUsers: records('listUsers', Promise.resolve({ data: [] })),
		},
	} as unknown as WorkOsClient;
}

const config = {
	apiKey: 'sk_test',
	clientId: 'client_test',
	cookiePassword: 'x'.repeat(32),
	redirectUri: 'https://app.example.test/auth/callback',
};

/** The object under test, over a client that records rather than calls WorkOS. */
function stubbedWorkOsAuth() {
	return createWorkOsAuth(config, stubWorkOsClient());
}

/**
 * What each session or read call is handed, and the WorkOS call it reaches.
 *
 * Keyed by the classification, so a method that changes side or joins the
 * object fails `tsc` here as well as at the interface.
 *
 * `reaches: null` is the four that answer before WorkOS. An absent session and
 * a null organization both return early, and giving them anything else would
 * need a sealed session WorkOS could unseal, so for those the assertion is that
 * the call ran rather than met the interlock. The other eight assert the
 * delegation as well: which SDK call arrived is what says the object was bound
 * to its target rather than replaced by the throwing shim.
 */
const SESSION_AND_READS: Record<
	WorkOsSessionAndReadMethod,
	{ readonly args: readonly unknown[]; readonly reaches: string | null }
> = {
	getAuthorizationUrl: { args: [], reaches: 'getAuthorizationUrl' },
	authenticateCode: { args: [{ code: 'code_1' }], reaches: 'authenticateWithCode' },
	authenticateSession: { args: [undefined, { mayRefresh: false }], reaches: null },
	switchOrganization: {
		args: [{ sealedSession: undefined, workosOrganizationId: 'org_1' }],
		reaches: null,
	},
	signInWithPassword: {
		args: [{ email: 'signed-in@example.test', password: 'sup3rsecret' }],
		reaches: 'authenticateWithPassword',
	},
	verifyEmailCode: {
		args: [{ code: '123456', pendingAuthenticationToken: 'pat_1' }],
		reaches: 'authenticateWithEmailVerification',
	},
	authenticateWithOrganizationSelection: {
		args: [{ organizationId: 'org_1', pendingAuthenticationToken: 'pat_1' }],
		reaches: 'authenticateWithOrganizationSelection',
	},
	getInvitationByToken: { args: ['itok_1'], reaches: 'findInvitationByToken' },
	getLogoutUrl: { args: [undefined], reaches: null },
	revokeSession: { args: [undefined], reaches: null },
	getOrganization: { args: [null], reaches: null },
	findOrganizationMember: {
		args: [{ email: 'invitee@example.test', workosOrganizationId: 'org_1' }],
		reaches: 'listUsers',
	},
};

type AnyCall = (...args: readonly unknown[]) => unknown;

beforeEach(() => {
	sdkCalls.length = 0;
});

describe('withoutWorkOsIdentityWrites', () => {
	// `tsc` already holds the classification to `keyof WorkOsAuth`, so this asks
	// the object rather than the interface: the two agree only while the literal
	// is what the annotation says it is, and this is the case that reads a
	// method count off something that ships instead of off a list.
	it('classifies every method the auth object carries', () => {
		const classified = [...WORKOS_IDENTITY_WRITE_METHODS, ...WORKOS_SESSION_AND_READ_METHODS];

		expect(Object.keys(stubbedWorkOsAuth()).sort()).toEqual(classified.sort());
	});

	it.each(WORKOS_IDENTITY_WRITE_METHODS)('refuses %s', (method) => {
		const wrapped = withoutWorkOsIdentityWrites(stubbedWorkOsAuth());

		expect(() => (wrapped[method] as AnyCall)()).toThrow(WorkOsIdentityWritesDisabledError);
		expect(sdkCalls).toEqual([]);
	});

	it.each(WORKOS_SESSION_AND_READ_METHODS)('passes %s through', async (method) => {
		const { args, reaches } = SESSION_AND_READS[method];
		const wrapped = withoutWorkOsIdentityWrites(stubbedWorkOsAuth());

		const refusal = await refusalFrom(() => (wrapped[method] as AnyCall)(...args));

		expect(refusal).toBeNull();
		expect(sdkCalls).toEqual(reaches === null ? [] : [reaches]);
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
		const wrapped = withoutWorkOsIdentityWrites(stubbedWorkOsAuth());

		expect(() => wrapped.sendOrganizationInvitation({} as never)).toThrow(
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
		const auth = stubbedWorkOsAuth();

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

/** What a call threw, or `null` when it answered. */
async function refusalFrom(call: () => unknown): Promise<unknown> {
	try {
		await call();
		return null;
	} catch (error) {
		return error;
	}
}

/** @vitest-environment jsdom */
import type {
	AppAuthController,
	AuthClient,
	AuthMe,
	SignInOutcome,
} from '@simmer-mosquito/auth/browser';
import { act, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, toState, useAuth } from '../../../auth/auth-context';

/**
 * The session states the screens route on.
 *
 * `_layout.tsx` picks the splash, the sign-in screen or the app from what this
 * provider reports, so a wrong answer here is a whole app on the wrong screen.
 * Every case below hands the provider its client and its controller, which is
 * what the props exist for: nothing here mocks a module path.
 */

type ProviderClient = Pick<AuthClient, 'signIn' | 'signOut'>;
type ProviderController = Pick<AppAuthController, 'snapshot' | 'subscribe' | 'load' | 'refresh'>;

const signedIn: AuthMe = {
	authenticated: true,
	user: {
		workosUserId: 'workos_user_1',
		email: 'field@example.test',
		firstName: 'Field',
		lastName: 'Collector',
		displayName: 'Field Collector',
		emailVerified: true,
		profilePictureUrl: null,
	},
	workosOrganizationId: 'workos_org_1',
	localIdentity: {
		userId: 'user_1',
		organizationId: 'org_1',
		profileId: 'profile_1',
		membershipId: 'membership_1',
		role: 'collector',
	},
};

const signedOut: AuthMe = { authenticated: false, reason: 'no_session' };

/** A sign-in that is not finished: the caller still owes a code. */
const verificationRequired: SignInOutcome = {
	status: 'verification_required',
	pendingAuthenticationToken: 'pending_1',
	email: 'field@example.test',
};

/**
 * A controller that answers when the test says so.
 *
 * `load` and `refresh` both leave an ask open, so a case can assert what the
 * provider reports while `/auth/me` is still in flight, which is the whole
 * point of the third state.
 */
function fakeController() {
	let snapshot: AuthMe | null = null;
	let settle: ((me: AuthMe) => void) | null = null;
	const listeners = new Set<() => void>();

	function ask(): Promise<AuthMe> {
		return new Promise<AuthMe>((resolve) => {
			settle = (me) => {
				snapshot = me;
				resolve(me);
				for (const listener of listeners) {
					listener();
				}
			};
		});
	}

	return {
		get snapshot() {
			return snapshot;
		},
		subscribe(listener: () => void) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		load: vi.fn(ask),
		refresh: vi.fn(ask),
		/** Answer whatever ask is open. */
		async answer(me: AuthMe) {
			await act(async () => {
				settle?.(me);
				settle = null;
			});
		},
	};
}

function fakeClient(overrides: Partial<ProviderClient> = {}): ProviderClient {
	return {
		signIn: vi.fn(async () => ({ status: 'authenticated', organizationRequired: false }) as const),
		signOut: vi.fn(async () => {}),
		...overrides,
	};
}

/** Mount the provider and hand back the context value as the screens see it. */
async function mount(client: ProviderClient, controller: ProviderController) {
	let latest: ReturnType<typeof useAuth> | null = null;

	function Consumer(): ReactNode {
		latest = useAuth();
		return null;
	}

	await act(async () => {
		render(
			<AuthProvider client={client} controller={controller}>
				<Consumer />
			</AuthProvider>,
		);
	});

	return {
		get value() {
			if (latest === null) {
				throw new Error('The provider rendered no consumer.');
			}

			return latest;
		},
	};
}

describe('toState', () => {
	it('reads no answer yet as loading rather than as signed out', () => {
		expect(toState(null)).toEqual({ status: 'loading' });
	});

	it('carries the reason a session was refused', () => {
		expect(toState(signedOut)).toEqual({ status: 'signed-out', reason: 'no_session' });
	});

	it('keeps the session on the signed-in state', () => {
		expect(toState(signedIn)).toEqual({ status: 'signed-in', me: signedIn });
	});
});

describe('AuthProvider', () => {
	it('reports loading until the controller answers, so the splash holds', async () => {
		const controller = fakeController();
		const mounted = await mount(fakeClient(), controller);

		expect(mounted.value.state.status).toBe('loading');
		expect(controller.load).toHaveBeenCalledTimes(1);

		await controller.answer(signedIn);

		expect(mounted.value.state.status).toBe('signed-in');
	});

	it('reports signed-out with the reason the session gave', async () => {
		const controller = fakeController();
		const mounted = await mount(fakeClient(), controller);

		await controller.answer(signedOut);

		expect(mounted.value.state).toEqual({ status: 'signed-out', reason: 'no_session' });
	});

	it('returns a verification outcome to the caller and leaves the session alone', async () => {
		const controller = fakeController();
		const client = fakeClient({ signIn: vi.fn(async () => verificationRequired) });
		const mounted = await mount(client, controller);
		await controller.answer(signedOut);

		let outcome: Awaited<ReturnType<typeof mounted.value.signIn>> | null = null;
		await act(async () => {
			outcome = await mounted.value.signIn({
				email: 'field@example.test',
				password: 'correct-horse',
			});
		});

		expect(outcome).toEqual(verificationRequired);
		expect(controller.refresh).not.toHaveBeenCalled();
		expect(mounted.value.state.status).toBe('signed-out');
	});

	it('moves the session on only once sign-in is authenticated', async () => {
		const controller = fakeController();
		const mounted = await mount(fakeClient(), controller);
		await controller.answer(signedOut);

		const signingIn = act(async () => {
			await mounted.value.signIn({ email: 'field@example.test', password: 'correct-horse' });
		});
		await act(async () => {});
		await controller.answer(signedIn);
		await signingIn;

		expect(controller.refresh).toHaveBeenCalledTimes(1);
		expect(mounted.value.state.status).toBe('signed-in');
	});

	it('leaves the app signed out when the revoke request never lands', async () => {
		const controller = fakeController();

		const revoke = vi.fn(async () => {
			throw new Error('Network request failed');
		});

		const client = fakeClient({
			signOut: vi.fn(async () => {
				/*
				 * What the real client does on a dead network. The server-side
				 * revoke is best effort and the stored credential is cleared
				 * either way, so a phone out of signal still signs out.
				 */
				await revoke().catch(() => {});
			}),
		});
		const mounted = await mount(client, controller);
		await controller.answer(signedIn);

		const signingOut = act(async () => {
			await mounted.value.signOut();
		});
		await act(async () => {});
		await controller.answer(signedOut);
		await signingOut;

		expect(revoke).toHaveBeenCalledTimes(1);
		expect(mounted.value.state.status).toBe('signed-out');
	});
});

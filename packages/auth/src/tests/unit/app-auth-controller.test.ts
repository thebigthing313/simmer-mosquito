import { describe, expect, it, vi } from 'vitest';
import { type AuthMe, createAppAuthController, SESSION_LOCK_NAME } from '../../browser.js';

const SIGNED_IN = {
	authenticated: true,
	user: { email: 'operator@example.test' },
} as unknown as AuthMe;

const REFUSED: AuthMe = { authenticated: false, reason: 'no session' };

describe('createAppAuthController', () => {
	it('asks once and serves the answer from the snapshot', async () => {
		const getAuthMe = vi.fn<() => Promise<AuthMe>>().mockResolvedValue(SIGNED_IN);
		const controller = createAppAuthController({ getAuthMe });

		await expect(controller.load()).resolves.toMatchObject({ authenticated: true });
		await expect(controller.load()).resolves.toMatchObject({ authenticated: true });
		expect(getAuthMe).toHaveBeenCalledOnce();
	});

	it('caches a real refusal', async () => {
		// A 401 comes back as a value, not a throw — that is an answer, and
		// re-asking on every guard would be a round trip per navigation.
		const getAuthMe = vi.fn<() => Promise<AuthMe>>().mockResolvedValue(REFUSED);
		const controller = createAppAuthController({ getAuthMe });

		await expect(controller.load()).resolves.toMatchObject({ authenticated: false });
		await expect(controller.load()).resolves.toMatchObject({ authenticated: false });
		expect(getAuthMe).toHaveBeenCalledOnce();
	});

	// The bug: one failed request signed a user out for the life of the page. The
	// snapshot held `authenticated: false`, `load()` short-circuits on any
	// non-null snapshot, and every later `/auth/me` answered 200 unread.
	it('does not let a broken round trip stand in for a refusal', async () => {
		const getAuthMe = vi
			.fn<() => Promise<AuthMe>>()
			.mockRejectedValueOnce(new Error('Failed to fetch'))
			.mockResolvedValue(SIGNED_IN);
		const controller = createAppAuthController({ getAuthMe });

		await expect(controller.load()).resolves.toMatchObject({ authenticated: false });

		// The failure was not recorded, so the next guard asks again and finds the
		// session that was there all along.
		await expect(controller.load()).resolves.toMatchObject({ authenticated: true });
		expect(getAuthMe).toHaveBeenCalledTimes(2);
	});

	it('keeps a known session through a blip rather than reporting it signed out', async () => {
		const getAuthMe = vi.fn<() => Promise<AuthMe>>().mockResolvedValueOnce(SIGNED_IN);
		const controller = createAppAuthController({ getAuthMe });
		await controller.load();

		getAuthMe.mockRejectedValueOnce(new Error('Failed to fetch'));

		// `refresh` is what the enter-organization flow calls after re-sealing a
		// session. A blip there must not read as "signed out" when we already know
		// better.
		await expect(controller.refresh()).resolves.toMatchObject({ authenticated: true });
		await expect(controller.load()).resolves.toMatchObject({ authenticated: true });
	});

	// #298's client half. Every synced collection meeting an expired session asks
	// this controller to renew it, and they meet it at the same moment: a per-caller
	// round trip would be one `/auth/me` per collection, each racing the others to
	// rotate the same single-use refresh token — the server-side bug, moved.
	it('renews once for however many callers ask at the same time', async () => {
		let release: (answer: AuthMe) => void = () => undefined;
		const getAuthMe = vi.fn<() => Promise<AuthMe>>().mockReturnValue(
			new Promise<AuthMe>((resolve) => {
				release = resolve;
			}),
		);
		const controller = createAppAuthController({ getAuthMe });

		const asked = Promise.all([controller.renew(), controller.renew(), controller.renew()]);
		release(SIGNED_IN);

		await expect(asked).resolves.toEqual([SIGNED_IN, SIGNED_IN, SIGNED_IN]);
		expect(getAuthMe).toHaveBeenCalledOnce();
	});

	it('asks again once the shared round trip has finished', async () => {
		// Deduplicating is for callers arriving together. A later caller wants the
		// current answer, not the one that was true a minute ago.
		const getAuthMe = vi.fn<() => Promise<AuthMe>>().mockResolvedValue(SIGNED_IN);
		const controller = createAppAuthController({ getAuthMe });

		await controller.renew();
		await controller.renew();

		expect(getAuthMe).toHaveBeenCalledTimes(2);
	});

	// The reason `refresh` and `renew` are two things. Signing in and entering an
	// organization re-seal the cookie and then ask who they are; an answer from a
	// round trip sent before the change describes the session they left.
	it('never serves a caller that changed the session an answer from before it', async () => {
		let release: (answer: AuthMe) => void = () => undefined;
		const before = new Promise<AuthMe>((resolve) => {
			release = resolve;
		});
		const getAuthMe = vi
			.fn<() => Promise<AuthMe>>()
			.mockReturnValueOnce(before)
			.mockResolvedValue(SIGNED_IN);
		const controller = createAppAuthController({ getAuthMe });

		const renewing = controller.renew();
		// `renew` goes through the session gate, so it reaches `/auth/me` one
		// microtask later than `refresh` does. Let it get there first: this case is
		// about which answer each caller receives, not which asks first.
		await Promise.resolve();
		const afterSignIn = controller.refresh();
		release(REFUSED);

		await expect(afterSignIn).resolves.toMatchObject({ authenticated: true });
		await expect(renewing).resolves.toMatchObject({ authenticated: false });
		expect(getAuthMe).toHaveBeenCalledTimes(2);
	});

	/*
	 * #301. `/auth/switch-organization` re-seals the session, which spends the same
	 * single-use refresh token `/auth/me` spends. One endpoint owning rotation
	 * (#298) does not cover the other, and the client-side single flight only
	 * deduplicates callers of `/auth/me`.
	 *
	 * So a session-changing call and a renewal must not overlap. These pin that
	 * from both directions, and pin that a failure cannot wedge the gate shut.
	 */
	it('holds a session change until an in-flight renewal has finished', async () => {
		const order: string[] = [];
		let releaseRenewal: (answer: AuthMe) => void = () => undefined;
		const getAuthMe = vi.fn<() => Promise<AuthMe>>().mockReturnValue(
			new Promise<AuthMe>((resolve) => {
				releaseRenewal = (answer) => {
					order.push('renewal answered');
					resolve(answer);
				};
			}),
		);
		const controller = createAppAuthController({ getAuthMe });

		const renewing = controller.renew();
		const switching = controller.exchange(async () => {
			order.push('session changed');
		});

		releaseRenewal(SIGNED_IN);
		await Promise.all([renewing, switching]);

		expect(order).toEqual(['renewal answered', 'session changed']);
	});

	it('holds a renewal until an in-flight session change has finished', async () => {
		const order: string[] = [];
		const getAuthMe = vi.fn<() => Promise<AuthMe>>().mockImplementation(async () => {
			order.push('renewal asked');
			return SIGNED_IN;
		});
		const controller = createAppAuthController({ getAuthMe });

		let resolveSwitch: () => void = () => undefined;
		const switched = new Promise<void>((resolve) => {
			resolveSwitch = resolve;
		});
		const switching = controller.exchange(() => switched);
		const renewing = controller.renew();

		order.push('session changed');
		resolveSwitch();
		await Promise.all([switching, renewing]);

		expect(order).toEqual(['session changed', 'renewal asked']);
	});

	it('opens the gate again after a session change fails', async () => {
		// A refused switch is ordinary — somebody lacks the membership — and it must
		// not leave every later renewal waiting on a promise that never settles.
		const getAuthMe = vi.fn<() => Promise<AuthMe>>().mockResolvedValue(SIGNED_IN);
		const controller = createAppAuthController({ getAuthMe });

		await expect(
			controller.exchange(async () => {
				throw new Error('refused');
			}),
		).rejects.toThrow('refused');

		await expect(controller.renew()).resolves.toMatchObject({ authenticated: true });
	});

	it('lets a caller that changed the session read it without queueing behind a renewal', async () => {
		// Every caller asks who they are after changing the session, and it must not
		// wait behind renewals that were queued before the change: those answer for
		// the session it just replaced. `refresh` skips the gate for that reason.
		// It still takes the cross-tab lock, so it is asked after the exchange
		// rather than inside it.
		const getAuthMe = vi.fn<() => Promise<AuthMe>>().mockResolvedValue(SIGNED_IN);
		const controller = createAppAuthController({ getAuthMe, locks: null });

		let releaseRenewal: () => void = () => undefined;
		const blocked = new Promise<void>((resolve) => {
			releaseRenewal = resolve;
		});
		const queued = controller.exchange(() => blocked);

		await expect(controller.refresh()).resolves.toMatchObject({ authenticated: true });

		releaseRenewal();
		await queued;
	});

	/*
	 * #304. The gate above is per tab; the sealed session cookie is per browser.
	 * Two tabs each renewing on their own schedule spend the same single-use
	 * refresh token, which is #298 again across a boundary the in-memory chain
	 * cannot see. Web Locks is the one mutex a browser shares between tabs.
	 */
	function fakeLocks() {
		const held: string[] = [];
		return {
			held,
			locks: {
				request: async <T>(
					name: string,
					_options: { readonly signal: AbortSignal },
					operation: () => Promise<T>,
				): Promise<T> => {
					held.push(name);
					return operation();
				},
			},
		};
	}

	/** A lock nobody ever gets, which is the stalled-tab case. */
	function neverGrantedLocks() {
		return {
			request: <T>(
				_name: string,
				options: { readonly signal: AbortSignal },
				_operation: () => Promise<T>,
			): Promise<T> =>
				new Promise<T>((_resolve, reject) => {
					options.signal.addEventListener('abort', () => {
						reject(new Error('AbortError'));
					});
				}),
		};
	}

	it('renews inside a lock every tab of this origin contends for', async () => {
		const { locks, held } = fakeLocks();
		const getAuthMe = vi.fn<() => Promise<AuthMe>>().mockResolvedValue(SIGNED_IN);
		const controller = createAppAuthController({ getAuthMe, locks });

		await controller.renew();

		expect(held).toEqual([SESSION_LOCK_NAME]);
	});

	it('changes the session inside the same lock', async () => {
		// Entering an organization re-seals the session, so it spends the token a
		// renewal spends. Serializing it against this tab's renewals (#301) does
		// nothing about the tab next door.
		const { locks, held } = fakeLocks();
		const getAuthMe = vi.fn<() => Promise<AuthMe>>().mockResolvedValue(SIGNED_IN);
		const controller = createAppAuthController({ getAuthMe, locks });

		await controller.exchange(async () => undefined);

		expect(held).toEqual([SESSION_LOCK_NAME]);
	});

	it('renews anyway rather than waiting on a lock forever', async () => {
		// The regression this bound exists for. `load()` runs in the root route's
		// guard, so a tab whose `/auth/me` hangs while holding a browser-wide lock
		// would leave every other tab of the origin on a spinner with no error and
		// no navigation. Serializing is worth having; it is not worth that.
		const getAuthMe = vi.fn<() => Promise<AuthMe>>().mockResolvedValue(SIGNED_IN);
		const controller = createAppAuthController({
			getAuthMe,
			locks: neverGrantedLocks(),
			lockWaitMs: 5,
		});

		await expect(controller.renew()).resolves.toMatchObject({ authenticated: true });
		expect(getAuthMe).toHaveBeenCalledOnce();
	});

	it('renews anyway when the lock cannot be taken at all', async () => {
		// `locks.request` rejects outright in an opaque origin, and with
		// `InvalidStateError` once the document is no longer fully active, which is
		// exactly what the sign-out redirect makes it.
		const getAuthMe = vi.fn<() => Promise<AuthMe>>().mockResolvedValue(SIGNED_IN);
		const controller = createAppAuthController({
			getAuthMe,
			locks: {
				request: async () => {
					throw new Error('InvalidStateError');
				},
			},
		});

		await expect(controller.renew()).resolves.toMatchObject({ authenticated: true });
	});

	it('does not run an operation twice when the operation itself failed', async () => {
		// The retry is for a lock that could not be taken, not for an operation that
		// ran and threw.
		const getAuthMe = vi.fn<() => Promise<AuthMe>>().mockResolvedValue(SIGNED_IN);
		const { locks } = fakeLocks();
		const controller = createAppAuthController({ getAuthMe, locks });
		const operation = vi.fn(async () => {
			throw new Error('refused');
		});

		await expect(controller.exchange(operation)).rejects.toThrow('refused');
		expect(operation).toHaveBeenCalledOnce();
	});

	it('reads the session under the lock after a change, not around it', async () => {
		// `refresh` reaches `/auth/me`, which is the endpoint that rotates. Skipping
		// the gate is right, since a caller that just changed the session should not
		// queue behind a renewal, but skipping the lock let a sign-in in one tab and
		// a renewal in another spend the same token.
		const { locks, held } = fakeLocks();
		const getAuthMe = vi.fn<() => Promise<AuthMe>>().mockResolvedValue(SIGNED_IN);
		const controller = createAppAuthController({ getAuthMe, locks });

		await controller.refresh();

		expect(held).toEqual([SESSION_LOCK_NAME]);
	});

	it('renews without a lock when the platform has none', async () => {
		// React Native has no Web Locks and no tabs to race, and an older browser
		// should lose the cross-tab guarantee rather than the ability to sign in.
		const getAuthMe = vi.fn<() => Promise<AuthMe>>().mockResolvedValue(SIGNED_IN);
		const controller = createAppAuthController({ getAuthMe, locks: null });

		await expect(controller.renew()).resolves.toMatchObject({ authenticated: true });
	});

	it('tells subscribers each time it has an answer, until they leave', async () => {
		const getAuthMe = vi.fn<() => Promise<AuthMe>>().mockResolvedValue(SIGNED_IN);
		const controller = createAppAuthController({ getAuthMe });
		const listener = vi.fn();

		const unsubscribe = controller.subscribe(listener);
		await controller.load();
		expect(listener).toHaveBeenCalledOnce();
		expect(controller.snapshot).toMatchObject({ authenticated: true });

		unsubscribe();
		await controller.refresh();
		expect(listener).toHaveBeenCalledOnce();
	});
});

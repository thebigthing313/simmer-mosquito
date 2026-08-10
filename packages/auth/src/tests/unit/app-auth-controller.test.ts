import { describe, expect, it, vi } from 'vitest';
import { type AuthMe, createAppAuthController } from '../../browser.js';

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

		// `refresh` is what the enter-agency flow calls after re-sealing a session.
		// A blip there must not read as "signed out" when we already know better.
		await expect(controller.refresh()).resolves.toMatchObject({ authenticated: true });
		await expect(controller.load()).resolves.toMatchObject({ authenticated: true });
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

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getAuthMe = vi.hoisted(() => vi.fn());

vi.mock('../../api', () => ({ getAuthMe }));

const SIGNED_IN = {
	authenticated: true as const,
	user: { email: 'operator@example.test' },
};

/**
 * A fresh module per test, because the controller is a module-level singleton —
 * its whole point is that one snapshot is shared by every route guard, which
 * also means one test's snapshot would otherwise be the next test's starting
 * state.
 */
async function loadController() {
	vi.resetModules();
	const { appAuthController } = await import('../../app-auth');
	return appAuthController;
}

describe('appAuthController', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('asks once and serves the answer from the snapshot', async () => {
		getAuthMe.mockResolvedValue(SIGNED_IN);
		const controller = await loadController();

		await expect(controller.load()).resolves.toMatchObject({ authenticated: true });
		await expect(controller.load()).resolves.toMatchObject({ authenticated: true });
		expect(getAuthMe).toHaveBeenCalledOnce();
	});

	it('caches a real refusal', async () => {
		// A 401 comes back as a value, not a throw — that is an answer, and
		// re-asking on every guard would be a round trip per navigation.
		getAuthMe.mockResolvedValue({ authenticated: false, reason: 'no session' });
		const controller = await loadController();

		await expect(controller.load()).resolves.toMatchObject({ authenticated: false });
		await expect(controller.load()).resolves.toMatchObject({ authenticated: false });
		expect(getAuthMe).toHaveBeenCalledOnce();
	});

	// The bug: one failed request signed an operator out for the life of the
	// page. The snapshot held `authenticated: false`, `load()` short-circuits on
	// any non-null snapshot, and every later `/auth/me` answered 200 unread.
	it('does not let a broken round trip stand in for a refusal', async () => {
		getAuthMe.mockRejectedValueOnce(new Error('Failed to fetch'));
		getAuthMe.mockResolvedValue(SIGNED_IN);
		const controller = await loadController();

		await expect(controller.load()).resolves.toMatchObject({ authenticated: false });

		// The failure was not recorded, so the next guard asks again and finds the
		// session that was there all along.
		await expect(controller.load()).resolves.toMatchObject({ authenticated: true });
		expect(getAuthMe).toHaveBeenCalledTimes(2);
	});

	it('keeps a known session through a blip rather than reporting it signed out', async () => {
		getAuthMe.mockResolvedValueOnce(SIGNED_IN);
		const controller = await loadController();
		await controller.load();

		getAuthMe.mockRejectedValueOnce(new Error('Failed to fetch'));

		// `refresh` is what the enter-agency flow calls after re-sealing a session.
		// A blip there must not read as "signed out" when we already know better.
		await expect(controller.refresh()).resolves.toMatchObject({ authenticated: true });
		await expect(controller.load()).resolves.toMatchObject({ authenticated: true });
	});
});

/**
 * What an app does when a synced collection is refused.
 *
 * Since #298 the shape and command routes verify the session and never renew it,
 * so a 401 from one means "ask `/auth/me` and come back", not "you are signed
 * out".
 * This is the piece that tells those two apart, and it is what keeps an expired
 * session from arriving in the workspace as a crash (#299).
 */

import { describe, expect, it, vi } from 'vitest';
import {
	type AuthMe,
	createAppAuthController,
	createSessionRecovery,
	sessionLostDestination,
} from '../../browser.js';

const SIGNED_IN = {
	authenticated: true,
	user: { email: 'field@example.test' },
} as unknown as AuthMe;

const REFUSED: AuthMe = { authenticated: false, reason: 'no_session_cookie_provided' };

function recoveryOver(answers: readonly AuthMe[]) {
	const remaining = [...answers];
	const getAuthMe = vi.fn(async () => remaining.shift() ?? REFUSED);
	const onSessionLost = vi.fn();
	const controller = createAppAuthController({ getAuthMe });

	return {
		getAuthMe,
		onSessionLost,
		controller,
		recover: createSessionRecovery({ controller, onSessionLost }),
	};
}

describe('createSessionRecovery', () => {
	it('renews the session and says the refused request is worth retrying', async () => {
		const { recover, onSessionLost } = recoveryOver([SIGNED_IN]);

		await expect(recover()).resolves.toBe(true);
		expect(onSessionLost).not.toHaveBeenCalled();
	});

	it('reports the session lost when it cannot be renewed', async () => {
		const { recover, onSessionLost } = recoveryOver([REFUSED]);

		await expect(recover()).resolves.toBe(false);
		expect(onSessionLost).toHaveBeenCalledOnce();
	});

	it('leaves the snapshot saying signed out, so the shell stops drawing a workspace', async () => {
		// #299: the shell threw because it read a ready-but-empty `organizations`
		// collection against a snapshot that still claimed a signed-in identity.
		// Recording the refusal is what makes those two agree again.
		const { recover, controller } = recoveryOver([REFUSED]);

		await recover();

		expect(controller.snapshot).toMatchObject({ authenticated: false });
	});

	it('reports the loss once, however many collections were refused', async () => {
		// Every mounted collection meets the same expiry in the same tick. Sending
		// the reader to sign in once per collection is a redirect storm.
		const { recover, onSessionLost, getAuthMe } = recoveryOver([REFUSED, REFUSED, REFUSED]);

		await Promise.all([recover(), recover(), recover()]);

		expect({
			lost: onSessionLost.mock.calls.length,
			asked: getAuthMe.mock.calls.length,
		}).toEqual({ lost: 1, asked: 1 });
	});

	it('reports a later loss after a session came back', async () => {
		// The latch is against a storm, not against the rest of the page's life. A
		// session that recovers and then ends again has to be reported again.
		const { recover, onSessionLost } = recoveryOver([REFUSED, SIGNED_IN, REFUSED]);

		await recover();
		await recover();
		await recover();

		expect(onSessionLost).toHaveBeenCalledTimes(2);
	});

	it('does not report a loss when the round trip itself broke', async () => {
		// A dropped request is not an answer. Signing the reader out over a blip
		// throws away a session that was never refused.
		const getAuthMe = vi.fn<() => Promise<AuthMe>>().mockResolvedValueOnce(SIGNED_IN);
		const onSessionLost = vi.fn();
		const controller = createAppAuthController({ getAuthMe });
		await controller.load();

		getAuthMe.mockRejectedValueOnce(new Error('Failed to fetch'));
		const recover = createSessionRecovery({ controller, onSessionLost });

		await expect(recover()).resolves.toBe(true);
		expect(onSessionLost).not.toHaveBeenCalled();
	});
});

describe('sessionLostDestination', () => {
	const publicPaths: ReadonlySet<string> = new Set(['/landing', '/sign-in']);

	function destinationFrom(pathname: string, search = '', hash = '') {
		return sessionLostDestination({
			signInPath: '/landing',
			publicPaths,
			location: { origin: 'https://app.test', pathname, search, hash },
		});
	}

	it('sends a reader back to where they were', () => {
		expect(destinationFrom('/larval-surveillance/habitats', '?status=active', '#map')).toBe(
			'https://app.test/landing?redirect=%2Flarval-surveillance%2Fhabitats%3Fstatus%3Dactive%23map',
		);
	});

	it('leaves a reader on a page that needs no session', () => {
		// Otherwise the collections that fail on the sign-in page reload the sign-in
		// page, which fails again. The loop is the bug this returns null for.
		expect([destinationFrom('/landing'), destinationFrom('/sign-in')]).toEqual([null, null]);
	});
});

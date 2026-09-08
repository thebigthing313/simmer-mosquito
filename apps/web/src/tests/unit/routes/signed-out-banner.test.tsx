/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SignedOutEnvironmentBanner } from '@simmer-mosquito/ui-web/components/environment-banner';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The strip above the signed-out pages (#408).
 *
 * Staging authenticates against WorkOS production (ADR 0017), so real
 * credentials work on this deployment and, before the strip, nothing on the page
 * said so. Four of the six routes it covers — sign-up, accept-invitation,
 * forgot-password, reset-password — are surfaces the identity interlock refuses,
 * so the sentence the banner exists to pre-empt fires here more than anywhere
 * behind sign-in.
 */

// jsdom has no ResizeObserver, and Radix's popper measures on open.
class NoopResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}
globalThis.ResizeObserver ??= NoopResizeObserver as unknown as typeof ResizeObserver;

describe('SignedOutEnvironmentBanner', () => {
	afterEach(cleanup);

	it('names the environment and what a refresh does to it', () => {
		render(<SignedOutEnvironmentBanner environment="staging" />);

		expect(screen.getByText('Staging')).toBeTruthy();
		expect(
			screen.getByText(
				'A copy of the production system. Anything you change here is erased on the next refresh.',
			),
		).toBeTruthy();
	});

	/*
	 * The copy that separates this strip from the authenticated one. "Your live
	 * data" is what the shell says, and it is wrong for a reader who has not
	 * signed in yet and, on `/sign-up`, never will.
	 */
	it('leads the popover with the credentials being real, then the refusal', () => {
		render(<SignedOutEnvironmentBanner environment="staging" />);

		fireEvent.click(screen.getByText('What is different here'));

		expect(screen.getByText('Your sign-in details are your real production ones.')).toBeTruthy();
		// Word for word the server's `WORKOS_IDENTITY_WRITES_DISABLED_MESSAGE`, so
		// a user meets one sentence rather than two (#376).
		expect(
			screen.getByText(
				'Staging does not allow changes to sign-in accounts, Memberships, roles, Organizations, or invitations.',
			),
		).toBeTruthy();
	});

	/*
	 * Both forms of absent, because a Docker `ARG` the image declares and the
	 * build never passes arrives as `''` rather than `undefined` (#85). Local
	 * development sets nothing either, and reads as production here on purpose:
	 * a developer's own machine is not a shared sandbox anybody can mistake for
	 * one.
	 */
	it('renders nothing anywhere else', () => {
		const { container, rerender } = render(<SignedOutEnvironmentBanner environment={undefined} />);
		expect(container.innerHTML).toBe('');

		rerender(<SignedOutEnvironmentBanner environment="" />);
		expect(container.innerHTML).toBe('');

		rerender(<SignedOutEnvironmentBanner environment="production" />);
		expect(container.innerHTML).toBe('');
	});
});

/**
 * That the two frames actually pass the variable.
 *
 * A banner nobody wires is the #390 failure: it merged, looked done, and was
 * inert for weeks because nothing set `VITE_SIMMER_ENVIRONMENT`. The frames are
 * read as text because rendering either one needs a router, and what is being
 * checked is the wiring rather than the markup.
 */
describe('the signed-out frames', () => {
	const routes = join(import.meta.dirname, '../../../routes');

	it.each(['-components.tsx', '-auth.tsx'])('wires the banner into %s', (file) => {
		const source = readFileSync(join(routes, file), 'utf8');

		expect(source).toContain(
			'<SignedOutEnvironmentBanner environment={import.meta.env.VITE_SIMMER_ENVIRONMENT} />',
		);
	});
});

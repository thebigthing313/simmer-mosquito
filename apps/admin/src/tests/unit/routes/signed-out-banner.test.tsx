/** @vitest-environment jsdom */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SignedOutEnvironmentBanner } from '@simmer-mosquito/ui-web/components/environment-banner';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

/**
 * The console's own front door carries the same strip (#408).
 *
 * An operator signs in with a real production identity here too, and the
 * console's organization creation and invitation routes are both refused on
 * staging, so the warning is worth as much before this form as before the web
 * app's.
 *
 * The copy is asserted in `apps/web`, which owns six of the seven signed-out
 * routes. What is app-specific is the gate and the wiring.
 */
describe('the operator sign-in banner', () => {
	afterEach(cleanup);

	it('shows on a staging build', () => {
		render(<SignedOutEnvironmentBanner environment="staging" />);

		expect(screen.getByText('Staging')).toBeTruthy();
	});

	// Both forms of absent: a Docker `ARG` the build never passes arrives as `''`
	// rather than `undefined` (#85).
	it('shows on no other build', () => {
		const { container, rerender } = render(<SignedOutEnvironmentBanner environment={undefined} />);
		expect(container.innerHTML).toBe('');

		rerender(<SignedOutEnvironmentBanner environment="" />);
		expect(container.innerHTML).toBe('');
	});

	// Read as text rather than rendered, because the frame needs a router. The
	// check is that the variable reaches it at all: #390's banner shipped inert.
	it('is wired into the auth frame', () => {
		const source = readFileSync(join(import.meta.dirname, '../../../routes/-auth.tsx'), 'utf8');

		expect(source).toContain(
			'<SignedOutEnvironmentBanner environment={import.meta.env.VITE_SIMMER_ENVIRONMENT} />',
		);
	});
});

/**
 * Whether a build keeps syncing while the tab reports hidden (#381).
 *
 * Asserted rather than reasoned about, because both halves of it are fixed at
 * build time and neither is visible in a running app until a shape hangs on a
 * loading skeleton for reasons that look like the network. `import.meta.env.DEV`
 * is false in any `vite build`, staging included, so the environment half is the
 * only thing separating staging from production.
 *
 * The sweep that used to sit above this, reading every collection module as text
 * to catch one that had assembled its own `serverUrl`, is in
 * `collection-modules.test.ts` and no longer reads text. A module now names its
 * factory instead of calling it, so there is nothing left for it to assemble.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncsWhileHidden } from '../../../../lib/collections/client-options';

/**
 * Each case stubs the environment and calls, because the module reads it at the
 * point of use. The three answers used to cost a registry reset and a dynamic
 * reimport per case. That reimport re-executed the module and everything it
 * pulls in, and timed out under a full-suite run (#476).
 */
describe('syncsWhileHidden', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	/** What the module answers with the two build-time values stubbed. */
	function answerIn(build: {
		readonly dev: boolean;
		readonly environment: string | undefined;
	}): boolean {
		vi.stubEnv('DEV', build.dev);
		vi.stubEnv('VITE_SIMMER_ENVIRONMENT', build.environment);
		return syncsWhileHidden();
	}

	it('is on in local development, with no environment named', () => {
		expect(answerIn({ dev: true, environment: undefined })).toBe(true);
	});

	it('is on in a staging build', () => {
		expect(answerIn({ dev: false, environment: 'staging' })).toBe(true);
	});

	// Both forms of absent, because a Docker `ARG` the image declares and the
	// build never passes arrives as `''` rather than `undefined` (#85).
	it('is off in a production build', () => {
		expect(answerIn({ dev: false, environment: undefined })).toBe(false);
		expect(answerIn({ dev: false, environment: '' })).toBe(false);
	});
});

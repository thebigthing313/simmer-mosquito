/**
 * Whether a build keeps syncing while the tab reports hidden (#381).
 *
 * Asserted rather than reasoned about, because every part of it is replaced at
 * build time and none of it is visible in a running app until a shape hangs on a
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

/**
 * The module is re-imported per case because the flag is a module-level const:
 * it is read once, at import, which is the point.
 */
describe('syncsWhileHidden', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	async function reimport(env: Record<string, unknown>): Promise<boolean> {
		for (const [key, value] of Object.entries(env)) {
			vi.stubEnv(key, value as string);
		}
		vi.resetModules();
		const module = await import('../../../../lib/collections/client-options');
		return module.syncsWhileHidden;
	}

	it('is on in local development, with no environment named', async () => {
		await expect(reimport({ DEV: true, VITE_SIMMER_ENVIRONMENT: undefined })).resolves.toBe(true);
	});

	it('is on in a staging build', async () => {
		await expect(reimport({ DEV: false, VITE_SIMMER_ENVIRONMENT: 'staging' })).resolves.toBe(true);
	});

	// Both forms of absent, because a Docker `ARG` the image declares and the
	// build never passes arrives as `''` rather than `undefined` (#85).
	it('is off in a production build', async () => {
		await expect(reimport({ DEV: false, VITE_SIMMER_ENVIRONMENT: undefined })).resolves.toBe(false);
		await expect(reimport({ DEV: false, VITE_SIMMER_ENVIRONMENT: '' })).resolves.toBe(false);
	});
});

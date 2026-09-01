/**
 * That every collection in this app was actually swept onto the shared options.
 *
 * This is the seam that catches a file missed in a three-module mechanical edit.
 * A module that writes its own `serverUrl` still compiles, still syncs, and still
 * hangs in a hidden tab, which is exactly the failure that is expensive to
 * notice. It looks like the environment rather than like a diff.
 *
 * It reads the source text rather than importing the modules, because importing
 * one creates a live collection that opens a shape stream. The invariant is about
 * what the files say, so reading what they say is the honest check.
 *
 * Prior art for asserting across every collection at once:
 * `packages/sync/src/tests/unit/index.test.ts`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const collectionsDir = join(import.meta.dirname, '../../../../lib/collections');

/**
 * A collection module is one that calls a `create…Collection` factory.
 *
 * Derived rather than listed, so a table added later is covered without anyone
 * remembering to add it here. It is also what excludes `client-options.ts` itself
 * and the write module `writes.ts`, which is not a collection and passes
 * nothing to one.
 */
function collectionModules(): readonly { readonly name: string; readonly source: string }[] {
	return readdirSync(collectionsDir)
		.filter((name) => name.endsWith('.ts'))
		.map((name) => ({ name, source: readFileSync(join(collectionsDir, name), 'utf8') }))
		.filter(({ source }) => /create\w+Collection\(/.test(source));
}

describe('collection modules', () => {
	it('finds the collections to check', () => {
		// So a broken filter cannot make the sweep below vacuously green.
		expect(collectionModules().length).toBe(3);
	});

	it('builds every collection from the shared client options', () => {
		const offending = collectionModules()
			.filter(({ source }) => !source.includes('...syncClientOptions,'))
			.map(({ name }) => name);

		expect(offending).toEqual([]);
	});

	it('leaves no module reaching for the server URL itself', () => {
		// The other half of the same invariant. Spreading the shared object and then
		// overwriting `serverUrl` would pass the check above and mean nothing.
		const offending = collectionModules()
			.filter(({ source }) => source.includes('getServerUrl'))
			.map(({ name }) => name);

		expect(offending).toEqual([]);
	});
});

/**
 * The other thing this module decides: whether a build keeps syncing while the
 * tab reports hidden (#381).
 *
 * Asserted rather than reasoned about, because every part of it is replaced at
 * build time and none of it is visible in a running app until a shape hangs on a
 * loading skeleton for reasons that look like the network. `import.meta.env.DEV`
 * is false in any `vite build`, staging included, so the environment half is the
 * only thing separating staging from production.
 *
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

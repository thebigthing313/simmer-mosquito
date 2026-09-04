/** @vitest-environment jsdom */

/**
 * Importing this app asks the server for nothing and builds no collection.
 *
 * This is issue #428 in one file. A collection module used to call its factory
 * at module scope, so importing any hook that named one created it, and
 * creating one is a decision about a server URL and a shape route. That is why
 * nothing in `apps/web` could test a read: the only way to reach `useHabitat`
 * was to build the real `habitats` collection first.
 *
 * It works by installing no collection source at all. A module that resolved a
 * collection while it loaded throws out of the registry rather than reach an
 * `expect` below, and `fetch` is stubbed so a module that reached the network
 * some other way fails here too.
 *
 * The route tree is imported as well as the hooks, and it is the half that
 * matters at boot: `main.tsx` installs the source after its own imports have
 * run, so a route module resolving a collection at module scope would throw
 * before the app had a source to build one with. That failure is a white
 * screen, not a slow page.
 *
 * What this cannot see is a module that calls a factory from `packages/sync`
 * directly rather than declaring it, because an Electric collection issues no
 * request until something subscribes. `collection-modules.test.ts` covers that
 * from the other side, by holding each table module to exporting its
 * declaration and nothing else.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hooksDir = join(import.meta.dirname, '../../hooks');

/**
 * Long, because this imports the whole app and the suite runs four files at a
 * time. The default five seconds measures the machine rather than the thing
 * under test.
 */
const IMPORT_TIMEOUT_MS = 60_000;

function hookModules(folder: 'queries' | 'mutations'): readonly string[] {
	return readdirSync(join(hooksDir, folder))
		.filter((name) => name.endsWith('.ts'))
		.map((name) => name.replace(/\.ts$/, ''));
}

/** Record every request rather than answering one, so the assertion names it. */
function watchFetch(): readonly string[] {
	const asked: string[] = [];
	vi.stubGlobal('fetch', (url: string) => {
		asked.push(String(url));
		return Promise.reject(new Error('a module asked the server for something at import'));
	});
	return asked;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('importing a hook', () => {
	it('finds the hooks to check', () => {
		// So a broken filter cannot make the sweep below vacuously green.
		expect(hookModules('queries').length).toBeGreaterThan(80);
		expect(hookModules('mutations').length).toBeGreaterThan(30);
	});

	it(
		'builds no collection and sends no request',
		async () => {
			const asked = watchFetch();

			// Two loops rather than one over a joined path: Vite's dynamic-import
			// rewriting only substitutes a variable one directory level deep.
			for (const name of hookModules('queries')) {
				await import(`../../hooks/queries/${name}.ts`);
			}
			for (const name of hookModules('mutations')) {
				await import(`../../hooks/mutations/${name}.ts`);
			}

			expect(asked).toEqual([]);
		},
		IMPORT_TIMEOUT_MS,
	);
});

describe('importing the route tree', () => {
	it(
		'builds no collection and sends no request',
		async () => {
			const asked = watchFetch();

			const module = await import('../../routeTree.gen');

			expect(module.routeTree).toBeDefined();
			expect(asked).toEqual([]);
		},
		IMPORT_TIMEOUT_MS,
	);
});

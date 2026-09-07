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
 *
 * ## Why the imports are up here and not in a case
 *
 * Between them these two sweeps load 154 hook modules and, through the
 * generated route tree, 131 route modules and everything those pull in. All of
 * it is `apps/web` source going through Vite's transform, and that transform is
 * the cost. Warm and idle it takes a few seconds. Under two concurrent uncached
 * full test runs it takes 100s to 120s, which blew the 60s per-case budget this
 * file used to declare for itself. So the file failed on machine load rather
 * than on anything it asserts (#545).
 *
 * Vitest applies `testTimeout` to a case body and `hookTimeout` to a hook, and
 * neither to module scope, because loading the file is collection rather than a
 * test. So the imports run here, where no budget governs them, and each case
 * asserts over what they recorded. A `beforeAll` would only move the budget
 * from 60s to 10s. The sibling `link-destinations.test.tsx` pays the route-tree
 * cost the same way, through the harness beside it, and has never flaked.
 *
 * The move costs no coverage. A module that builds a collection or calls
 * `fetch` while it loads still fails the file, and a specifier naming no module
 * still rejects rather than hangs. What changes is where the failure is
 * reported: against the file rather than against one case, because a sweep that
 * throws takes collection down with it. So reaching a case is itself the proof
 * that both sweeps finished and the registry was never asked for a collection,
 * and the assertion inside it is the second half, the requests.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

const hooksDir = join(import.meta.dirname, '../../hooks');

function hookModules(folder: 'queries' | 'mutations'): readonly string[] {
	return readdirSync(join(hooksDir, folder))
		.filter((name) => name.endsWith('.ts'))
		.map((name) => name.replace(/\.ts$/, ''));
}

/**
 * Run `load` with `fetch` recording every request rather than answering one, so
 * an assertion below names the URL a module asked for.
 *
 * The stub goes up before the first import and comes down after the last, and
 * both halves are here so a third sweep cannot be added without them.
 *
 * The URL is in the rejection as well as in the array, because a module that
 * awaits its request never lets an assertion run: the rejection throws out of
 * module scope and the file fails to collect. That failure has to name the URL
 * on its own.
 */
async function recordRequests<T>(load: () => Promise<T>): Promise<readonly [T, readonly string[]]> {
	const asked: string[] = [];
	vi.stubGlobal('fetch', (url: string) => {
		asked.push(String(url));
		return Promise.reject(new Error(`a module asked the server for ${url} at import`));
	});
	const loaded = await load();
	vi.unstubAllGlobals();
	return [loaded, asked];
}

const queryHooks = hookModules('queries');
const mutationHooks = hookModules('mutations');

const [, askedByHooks] = await recordRequests(async () => {
	// Two loops rather than one over a joined path: Vite's dynamic-import
	// rewriting only substitutes a variable one directory level deep.
	for (const name of queryHooks) {
		await import(`../../hooks/queries/${name}.ts`);
	}
	for (const name of mutationHooks) {
		await import(`../../hooks/mutations/${name}.ts`);
	}
});

const [routeTreeModule, askedByRouteTree] = await recordRequests(
	() => import('../../routeTree.gen'),
);

describe('importing a hook', () => {
	it('finds the hooks to check', () => {
		// So a broken filter cannot make the sweep above vacuously green.
		expect(queryHooks.length).toBeGreaterThan(80);
		expect(mutationHooks.length).toBeGreaterThan(30);
	});

	it('builds no collection and sends no request', () => {
		expect(askedByHooks).toEqual([]);
	});
});

describe('importing the route tree', () => {
	it('builds no collection and sends no request', () => {
		expect(routeTreeModule.routeTree).toBeDefined();
		expect(askedByRouteTree).toEqual([]);
	});
});

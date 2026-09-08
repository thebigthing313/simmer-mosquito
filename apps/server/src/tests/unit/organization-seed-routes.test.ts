/**
 * The six seed creates, and the surface they are the last of.
 *
 * `organization-seed-routes.ts` is what `apps/admin` posts to while standing a
 * new Organization up. It is a thin module by design and the thing worth
 * asserting about it is its shape rather than its writes: the six paths exist,
 * nothing else does, and the role floor still answers before anything is
 * written.
 *
 * The second half is the check #634 owes. 112 routes on the older per-domain
 * write surface went, and "went" is a claim about what the app registers, which
 * nothing else in this tree reads back. `registeredRoutes()` walks the real
 * `registerAllRoutes`, so a module quietly re-mounted would fail here.
 */

import type { SimmerRole } from '@simmer-mosquito/db';
import { createCompileOnlyDb } from '@simmer-mosquito/db/test-support';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../../auth-context.js';
import type { AuthVariables } from '../../auth-middleware.js';
import { registerOrganizationSeedRoutes } from '../../organization-seed-routes.js';
import { registeredRoutes } from './support/registered-routes.js';

const SEED_PATHS = [
	'/foundation/addresses',
	'/foundation/collection-methods',
	'/foundation/collection-lures',
	'/foundation/habitat-types',
	'/foundation/region-folders',
	'/foundation/regions',
	'/foundation/organization-species',
	'/adult-surveillance/traps',
] as const;

describe('the organization seed routes', () => {
	it.each(SEED_PATHS)('registers POST %s', (path) => {
		expect(registeredRoutes()).toContainEqual({ method: 'POST', path });
	});

	// Eight paths, six call sites: `apps/admin` reaches three of them through one
	// templated call over its lookup catalogs.
	it('registers nothing but those creates', () => {
		expect(
			routeNames(
				(path) => path.startsWith('/foundation/') || path.startsWith('/adult-surveillance/'),
			),
		).toEqual(SEED_PATHS.map((path) => `POST ${path}`).sort());
	});

	// The floor answers before the write opens a transaction, so a compile-only
	// database is enough to see the refusal. "Lookup management is owner/admin
	// only": a manager clears the tag catalog's floor and is still refused here.
	it.each([
		['manager', '/foundation/collection-methods'],
		['collector', '/foundation/collection-lures'],
		['viewer', '/foundation/habitat-types'],
		['viewer', '/foundation/regions'],
		['viewer', '/adult-surveillance/traps'],
	] as const)('refuses a %s posting %s', async (role, path) => {
		const response = await seedApp(role).request(path, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			// Valid for every one of these: the role check sits after the command is
			// built, so a malformed body would answer 400 and prove nothing about the
			// role.
			body: JSON.stringify({
				id: 'c15223fd-f242-4e6f-8c0e-0229ecdd95c3',
				name: 'CDC light trap',
				trapName: 'CDC light trap',
				collectionMethodId: '4fe25a2d-925c-4d37-9d4e-07185ad19858',
				geometry: {
					type: 'Polygon',
					coordinates: [
						[
							[-90.5, 35.5],
							[-90.4, 35.5],
							[-90.4, 35.6],
							[-90.5, 35.5],
						],
					],
				},
				locationSource: {
					kind: 'geometry',
					geometry: { type: 'Point', coordinates: [-90.5, 35.5] },
				},
			}),
		});

		expect(response.status).toBe(403);
		await expect(response.json()).resolves.toMatchObject({ error: 'forbidden' });
	});
});

describe('the older per-domain write surface', () => {
	// Prefix by prefix, because a partial deletion is the failure that would
	// otherwise read as a pass: every route family below had a client of its own
	// in neither `apps/web`, `apps/admin` nor `apps/mobile`.
	it.each([
		'/control-methods/',
		'/control-assets/',
		'/control-products/',
		'/public-engagement/',
		'/control-operations/',
		'/field-work/',
		'/mission-dispatch/',
	])('registers no route under %s', (prefix) => {
		expect(registeredRoutes().filter((route) => route.path.startsWith(prefix))).toEqual([]);
	});

	// The two that stayed, and why. The read is a cross-habitat rollup the
	// on-demand shapes serve badly; the generate is one of the commands
	// `docs/domain-command-contract.md` keeps off the table surface because its
	// answer is a set rather than a row.
	it('keeps the awaiting-samples read and the notification generate', () => {
		expect(registeredRoutes()).toContainEqual({
			method: 'GET',
			path: '/larval-surveillance/samples/awaiting',
		});
		expect(registeredRoutes()).toContainEqual({
			method: 'POST',
			path: '/commands/mission_notifications/generate',
		});
	});

	it('registers nothing else under the larval prefix', () => {
		expect(routeNames((path) => path.startsWith('/larval-surveillance/'))).toEqual([
			'GET /larval-surveillance/samples/awaiting',
		]);
	});
});

/**
 * The distinct `METHOD path` pairs the walk found under `matches`, sorted.
 *
 * Distinct because Hono writes one entry per handler rather than per route, and
 * every route here mounts the auth middleware ahead of its handler, so the walk
 * names each of them twice. What these two cases ask is which routes exist, and
 * a duplicate is the same route.
 */
function routeNames(matches: (path: string) => boolean): string[] {
	return [
		...new Set(
			registeredRoutes()
				.filter((route) => matches(route.path))
				.map((route) => `${route.method} ${route.path}`),
		),
	].sort();
}

function seedApp(role: SimmerRole): Hono<{ Variables: AuthVariables }> {
	const app = new Hono<{ Variables: AuthVariables }>();
	registerOrganizationSeedRoutes(app, {
		db: createCompileOnlyDb(),
		authContextMiddleware: createMiddleware<{ Variables: AuthVariables }>(async (context, next) => {
			context.set('authContext', {
				organization: { id: 'f0dbf1c7-d278-441e-82b4-9292d390ce72' },
				profile: { id: '0105b111-e0be-46b0-b5e9-a87507889b51' },
				role,
			} as AuthContext);
			await next();
		}),
	});
	return app;
}

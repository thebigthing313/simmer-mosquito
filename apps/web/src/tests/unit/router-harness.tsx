/**
 * Rendering a component that carries a `Link`, so a test can read where it goes.
 *
 * `tsc` already checks every `to` and `params` pair against the generated route
 * tree, so a destination that does not exist fails the build rather than 404ing
 * at runtime. That is real coverage, and it is why nothing here is about whether
 * a path is spelled correctly. What the compiler cannot see is a destination
 * that is well formed and wrong: the right route carrying the wrong id, `params`
 * built from a neighbouring field on the same row, a link that should have been
 * conditional. Each of those needs the resolved href, and an href needs a
 * router.
 *
 * ## The generated route tree, not a stub
 *
 * The router is built over `routeTree.gen.ts`, so an href read here is the one
 * the app produces. A stub tree would be faster, since importing the generated
 * tree pulls in every route module and that is about 13 seconds. But a stub is a
 * second copy of the route paths, hand-written, with nothing holding it to the
 * first. A case asserting `/larval-surveillance/inspections/<id>` against a stub
 * that spells the path that way is a case agreeing with itself, which is the
 * class of bug this file exists to catch.
 *
 * So the cost is paid, and paid once. Vitest isolates modules per file, so a
 * second suite importing this pays the 13 seconds again; link cases belong
 * together in `link-destinations.test.tsx` rather than scattered.
 *
 * ## Why no route is mounted
 *
 * `RouterContextProvider` puts the router in React context and renders its
 * children. `RouterProvider` would render the matched route instead, and that
 * difference is the whole of this file. `Link` resolves its href through
 * `router.buildLocation`, which reads the route tree and nothing else, so no
 * `beforeLoad` runs, no route component mounts, and no loader has to be
 * satisfiable for a destination to be readable. That matters here, because every
 * route in this app loads from synced collections behind an auth context.
 *
 * The component under test still renders for real, hooks and all. A suite that
 * wants its rows to come from a collection installs the memory source beside
 * this, the way the `hooks/queries` suites do.
 */

import { createMemoryHistory, createRouter, RouterContextProvider } from '@tanstack/react-router';
import { type RenderResult, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { appAuthController } from '../../app-auth';
import { routeTree } from '../../routeTree.gen';

/**
 * The app's own controller rather than a stand-in.
 *
 * The root route is a `createRootRouteWithContext`, so a router owes it one.
 * Nothing reads it here, since `beforeLoad` is what would and no match is
 * rendered, but handing over the real one keeps a fake shaped like an auth
 * controller out of this file, which is a thing a reader would have to keep
 * checking is still shaped right.
 */
function buildHarnessRouter() {
	return createRouter({
		routeTree,
		context: { auth: appAuthController },
		history: createMemoryHistory({ initialEntries: ['/'] }),
	});
}

/** Render `ui` with a router in context, so the `Link`s inside it resolve. */
export function renderWithRouter(ui: ReactNode): RenderResult {
	return render(<RouterContextProvider router={buildHarnessRouter()}>{ui}</RouterContextProvider>);
}

/**
 * Where the link with this accessible name goes.
 *
 * Throws when no link answers to the name, the same way `getByRole` does, so a
 * link that stopped rendering fails as a missing link rather than as a `null`
 * href somebody has to trace back.
 */
export function linkHref(name: string | RegExp): string | null {
	return screen.getByRole('link', { name }).getAttribute('href');
}

/**
 * Every destination on screen, in document order.
 *
 * The count is half of what this asserts. A row whose first cell is the link and
 * whose other cells are inert reads as one entry, so a second link appearing in
 * the row, or the whole row becoming clickable, fails the case that named one.
 */
export function linkHrefs(): readonly (string | null)[] {
	return screen.queryAllByRole('link').map((link) => link.getAttribute('href'));
}

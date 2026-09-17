/** @vitest-environment jsdom */

/**
 * The search page's heading is a `PageHeader`, and the input stays below it
 * (#1056).
 *
 * The page used to write its own `<h1>` at `text-2xl`, so its title was a
 * different size and sat a different distance from the frame's top edge than
 * the route-loading skeleton's title bar and every other framed page. What is
 * asserted is the shape rather than a pixel: the level-one heading is the one
 * `PageHeader` draws, inside its `<header>` and at the registered `text-heading`
 * role, and the input follows it in the document rather than sitting in the
 * header's action slot. The route is rendered whole with an empty query, so no
 * search is sent; the router and the transport are the stand-ins beside the
 * other route suites, and the component is preloaded first because the split
 * build's lazy stand-in would otherwise overrun the test timeout while it
 * imports.
 */

import { cleanup, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installMemoryCollections } from '../lib/collections/memory-collections';
import { preloadRouteComponent, renderExplorer } from './explorer-route-harness';

const harness = vi.hoisted(() => ({
	/**
	 * The search a match would carry: no query. One object rather than a fresh
	 * one per read, since the stand-in hands it to `useSyncExternalStore`.
	 */
	search: {} as Record<string, unknown>,
	/** Every request the route sent. An empty query should send none. */
	sent: [] as URL[],
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('./route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => harness.search);
});

vi.mock('@simmer-mosquito/sync', async (importOriginal) => {
	const { sessionFetchStandIn } = await import('./route-mock-stand-ins');
	return {
		...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
		sessionFetch: sessionFetchStandIn(harness.sent, () => ({})),
	};
});

let SearchPage: () => ReactNode;

beforeAll(async () => {
	SearchPage = await preloadRouteComponent(() => import('../../../routes/search'), 'search');
}, 300_000);

beforeEach(() => {
	installMemoryCollections();
	harness.sent.length = 0;
});

afterEach(() => {
	cleanup();
});

describe('the search page heading', () => {
	it('draws its title through PageHeader, with the input below it', async () => {
		renderExplorer(SearchPage);

		const heading = await screen.findByRole('heading', { level: 1, name: 'Search' });
		expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
		expect(heading.closest('header')).not.toBeNull();
		expect(heading.classList.contains('text-heading')).toBe(true);

		const input = screen.getByRole('textbox', { name: 'Search' });
		expect(input.classList.contains('max-w-xl')).toBe(true);
		expect(input.closest('header')).toBeNull();
		expect(heading.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

		expect(harness.sent).toHaveLength(0);
	});
});

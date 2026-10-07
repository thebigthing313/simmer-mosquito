/** @vitest-environment jsdom */

/**
 * The collections explorer, rendered whole, through the two things its rail
 * draws when the page holds collections: the rows at 100 or fewer, and the
 * summary over that (#1373). What a click on a group writes is
 * `collection-summary.test.tsx`'s; this is the seam between the route and the
 * frame, that the summary is asked for under the page's own box and filters,
 * date window included, and that neither branch draws a pager.
 *
 * The fakes are `traps-empty-state.test.tsx`'s, for the reasons its docblock
 * gives, and the component is preloaded first for the same reason.
 */

import { cleanup, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { organizations } from '../../../../../lib/collections/organizations';
import type { MinimumRole } from '../../../../../lib/write-access';
import { installMemoryCollections, seedRows } from '../../../lib/collections/memory-collections';
import {
	preloadRouteComponent,
	renderExplorer,
	stubPanelLayout,
} from '../../explorer-route-harness';

const harness = vi.hoisted(() => ({
	/** The search params a match would carry: the route's filters. */
	search: {} as Record<string, unknown>,
	/** Every request the route sent, in order. */
	sent: [] as URL[],
	/** What the extent endpoint answers. */
	extent: { west: 0, south: -1, east: 1, north: 0 } as unknown,
	/** What the page endpoint answers. */
	page: { collections: [], total: 0 } as {
		readonly collections: readonly unknown[];
		readonly total: number;
	},
	/** What the summary endpoint answers. */
	summary: null as unknown,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../../route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => harness.search);
});

vi.mock('@simmer-mosquito/sync', async (importOriginal) => {
	const { sessionFetchStandIn } = await import('../../route-mock-stand-ins');
	return {
		...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
		sessionFetch: sessionFetchStandIn(harness.sent, (url) => {
			if (url.pathname.endsWith('/extent')) {
				return { extent: harness.extent };
			}
			return url.pathname.endsWith('/summary') ? harness.summary : harness.page;
		}),
	};
});

vi.mock('../../../../../hooks/use-can-write', async () => {
	const { roleReaches } = await import('../../explorer-route-harness');
	return { useHasRole: (minimum: MinimumRole) => roleReaches('admin', minimum) };
});

vi.mock('../../../../../components/map', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../../../components/map')>();
	const { MapCanvasStandIn } = await import('../../explorer-route-harness');
	return { ...actual, MapCanvas: MapCanvasStandIn };
});

stubPanelLayout();

let CollectionsExplorer: () => ReactNode;

beforeAll(async () => {
	CollectionsExplorer = await preloadRouteComponent(
		() => import('../../../../../routes/adult-surveillance/collections/index'),
		'collections',
	);
}, 300_000);

beforeEach(() => {
	installMemoryCollections();
	seedRows(organizations, [{ id: 'org-1', name: 'Test Mosquito Control', settings: {} }]);
	harness.search = {};
	harness.sent.length = 0;
	harness.page = { collections: [], total: 0 };
	harness.summary = null;
});

afterEach(() => {
	cleanup();
});

const COLLECTION = {
	id: 'collection-1',
	trapId: null,
	addressDisplayName: '12 Kings Hwy',
	lat: -0.5,
	lng: 0.5,
	collectionMethodId: 'method-1',
	collectedAt: null,
	collectionDate: '2026-09-20',
	hasProblem: false,
	isZeroResult: false,
	hasBycatch: false,
	status: 'collected',
	setByProfileId: null,
	collectedByProfileId: null,
};

describe('the collections explorer with collections in view', () => {
	it('draws the summary instead of the rows over 100 in view, with no pager', async () => {
		harness.search = { from: '2026-09-01', to: '2026-09-28', problems: true };
		harness.page = { collections: [COLLECTION], total: 240 };
		harness.summary = {
			total: 240,
			groups: {
				problem: [{ value: true, count: 240 }],
				awaiting: [
					{ value: false, count: 200 },
					{ value: true, count: 40 },
				],
				collectionMethodId: [{ value: 'method-1', count: 240 }],
			},
			figures: { zeroResult: 12, collected: 180 },
		};
		renderExplorer(CollectionsExplorer);

		// The flag the address bar holds is drawn as the selected group.
		const problem = await screen.findByRole('button', {
			name: 'Problem reported, 240 collections',
		});
		expect(problem.getAttribute('aria-pressed')).toBe('true');
		expect(screen.getByRole('region', { name: 'Status' }).textContent).toBe(
			'StatusZero result12Collected180',
		);
		expect(screen.queryByText('12 Kings Hwy')).toBeNull();
		expect(screen.queryByRole('button', { name: 'Go to next page' })).toBeNull();

		const summaryRequest = harness.sent.find((url) => url.pathname === '/map/collections/summary');
		expect(Object.fromEntries(summaryRequest?.searchParams ?? [])).toEqual({
			bbox: '0,-0.8,1,0',
			problem: 'true',
			dateFrom: '2026-09-01',
			dateTo: '2026-09-28',
		});
	});

	it('draws the rows at 100 or fewer, with no pager and no summary request', async () => {
		harness.page = { collections: [COLLECTION], total: 1 };
		renderExplorer(CollectionsExplorer);

		expect(await screen.findByText('12 Kings Hwy')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Go to next page' })).toBeNull();
		expect(harness.sent.some((url) => url.pathname === '/map/collections/summary')).toBe(false);
	});
});

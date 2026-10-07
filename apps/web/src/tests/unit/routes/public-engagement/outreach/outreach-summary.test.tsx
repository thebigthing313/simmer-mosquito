/** @vitest-environment jsdom */

/**
 * The outreach actions explorer, rendered whole, through the two things its
 * rail draws when the page holds outreach actions: the rows at 100 or fewer,
 * and the summary over that (#1377). What a click on a group writes is
 * `outreach-summary.test.tsx`'s under `components`; this is the seam between
 * the route and the frame, that the summary is asked for under the page's own
 * box and filters, date window included, and that neither branch draws a
 * pager.
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
	page: { outreachActions: [], total: 0 } as {
		readonly outreachActions: readonly unknown[];
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

let OutreachExplorer: () => ReactNode;

beforeAll(async () => {
	OutreachExplorer = await preloadRouteComponent(
		() => import('../../../../../routes/public-engagement/outreach/index'),
		'outreach actions',
	);
}, 300_000);

beforeEach(() => {
	installMemoryCollections();
	seedRows(organizations, [{ id: 'org-1', name: 'Test Mosquito Control', settings: {} }]);
	harness.search = {};
	harness.sent.length = 0;
	harness.page = { outreachActions: [], total: 0 };
	harness.summary = null;
});

afterEach(() => {
	cleanup();
});

const OUTREACH_ACTION = {
	id: 'outreach-action-1',
	lat: -0.5,
	lng: 0.5,
	outreachMethodId: 'method-1',
	outreachDate: '2026-09-20',
	reach: 30,
	reachDescription: null,
	technicianProfileId: null,
	inspectionId: null,
};

describe('the outreach actions explorer with outreach actions in view', () => {
	it('draws the summary instead of the rows over 100 in view, with no pager', async () => {
		harness.search = {
			from: '2026-09-01',
			to: '2026-09-28',
			methods: ['method-1'],
			people: ['person-1'],
		};
		harness.page = { outreachActions: [OUTREACH_ACTION], total: 240 };
		harness.summary = {
			total: 240,
			groups: {
				outreachMethodId: [{ value: 'method-1', count: 240 }],
				technicianProfileId: [{ value: 'person-1', count: 240 }],
			},
			figures: { reachTotal: 7200 },
		};
		renderExplorer(OutreachExplorer);

		// The method the address bar holds is drawn as the selected group.
		const method = await screen.findByRole('button', {
			name: 'Unknown method, 240 outreach actions',
		});
		expect(method.getAttribute('aria-pressed')).toBe('true');
		expect(
			screen
				.getByRole('button', { name: 'Unknown person, 240 outreach actions' })
				.getAttribute('aria-pressed'),
		).toBe('true');
		expect(screen.getByRole('region', { name: 'Totals' }).textContent).toBe(
			'TotalsTotal reach7,200 people',
		);
		expect(screen.queryByRole('link', { name: 'Unknown method' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Go to next page' })).toBeNull();

		const summaryRequest = harness.sent.find((url) => url.pathname === '/map/outreach/summary');
		expect(Object.fromEntries(summaryRequest?.searchParams ?? [])).toEqual({
			bbox: '0,-0.8,1,0',
			outreachMethodId: 'method-1',
			technician: 'person-1',
			dateFrom: '2026-09-01',
			dateTo: '2026-09-28',
		});
	});

	it('draws the rows at 100 or fewer, with no pager and no summary request', async () => {
		harness.page = { outreachActions: [OUTREACH_ACTION], total: 1 };
		renderExplorer(OutreachExplorer);

		expect(await screen.findByRole('link', { name: 'Unknown method' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Go to next page' })).toBeNull();
		expect(harness.sent.some((url) => url.pathname === '/map/outreach/summary')).toBe(false);
	});
});

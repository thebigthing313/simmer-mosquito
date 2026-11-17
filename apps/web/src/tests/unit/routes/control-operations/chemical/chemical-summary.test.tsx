/** @vitest-environment jsdom */

/**
 * The chemical applications explorer, rendered whole, through the two things
 * its rail draws when the page holds applications: the rows at 100 or fewer,
 * and the summary over that (#1374). What a click on a group writes is
 * `application-summary.test.tsx`'s; this is the seam between the route and the
 * frame, that the summary is asked for under the page's own box and filters,
 * date window included, and that neither branch draws a pager.
 *
 * The fakes are `traps-empty-state.test.tsx`'s, for the reasons its docblock
 * gives, and the component is preloaded first for the same reason.
 */

import { cleanup, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { insecticides } from '../../../../../lib/collections/insecticides';
import { organizations } from '../../../../../lib/collections/organizations';
import type { MinimumRole } from '../../../../../lib/write-access';
import { installMemoryCollections, seedRows } from '../../../lib/collections/memory-collections';
import {
	preloadRouteComponent,
	renderExplorer,
	SUMMARY_CASE_TIMEOUT,
	SUMMARY_WAIT,
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
	page: { treatments: [], total: 0 } as {
		readonly treatments: readonly unknown[];
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

let ChemicalExplorer: () => ReactNode;

beforeAll(async () => {
	ChemicalExplorer = await preloadRouteComponent(
		() => import('../../../../../routes/control-operations/chemical/index'),
		'chemical applications',
	);
}, 300_000);

beforeEach(() => {
	installMemoryCollections();
	seedRows(organizations, [{ id: 'org-1', name: 'Test Mosquito Control', settings: {} }]);
	harness.search = {};
	harness.sent.length = 0;
	harness.page = { treatments: [], total: 0 };
	harness.summary = null;
});

afterEach(() => {
	cleanup();
});

/** One Treatment with two products, as `/map/chemical` answers it (ADR 0020). */
const TREATMENT = {
	id: 'treatment-1',
	lat: -0.5,
	lng: 0.5,
	applicationMethodId: null,
	applicationDate: '2026-09-20',
	habitatId: null,
	applicatorProfileId: null,
	applicatorName: 'Ana Ortiz',
	lines: [
		{
			id: 'line-1',
			insecticideId: 'insecticide-1',
			amountApplied: 2,
			applicationUnitId: 'unit-1',
			batchNames: ['B-2'],
		},
		{
			id: 'line-2',
			insecticideId: 'insecticide-2',
			amountApplied: 4,
			applicationUnitId: 'unit-1',
			batchNames: ['A-9', 'B-2'],
		},
	],
};

describe('the chemical applications explorer with applications in view', () => {
	// The summary waits on three requests in turn, so this case outlasts the
	// 5000ms default; `SUMMARY_WAIT` in the harness says why.
	it(
		'draws the summary instead of the rows over 100 in view, with no pager',
		async () => {
			harness.search = { from: '2026-09-01', to: '2026-09-28', methods: ['method-1'] };
			harness.page = { treatments: [TREATMENT], total: 240 };
			harness.summary = {
				total: 240,
				groups: {
					insecticideId: [{ value: 'insecticide-1', count: 240 }],
					applicationMethodId: [{ value: 'method-1', count: 240 }],
					applicatorProfileId: [{ value: null, count: 240 }],
				},
				breakdowns: {
					amountApplied: [
						{ by: { insecticideId: 'insecticide-1', unitId: 'unit-1' }, count: 240, sum: 480 },
					],
				},
			};
			renderExplorer(ChemicalExplorer);

			// The method the address bar holds is drawn as the selected group.
			const method = await screen.findByRole(
				'button',
				{ name: 'Unknown method, 240 treatments' },
				SUMMARY_WAIT,
			);
			expect(method.getAttribute('aria-pressed')).toBe('true');
			expect(screen.getByRole('region', { name: 'Amount Applied' }).textContent).toBe(
				'Amount AppliedUnknown insecticide480',
			);
			expect(screen.queryByText('Ana Ortiz')).toBeNull();
			expect(screen.queryByRole('button', { name: 'Go to next page' })).toBeNull();

			const summaryRequest = harness.sent.find((url) => url.pathname === '/map/chemical/summary');
			expect(Object.fromEntries(summaryRequest?.searchParams ?? [])).toEqual({
				bbox: '0,-0.8,1,0',
				applicationMethodId: 'method-1',
				dateFrom: '2026-09-01',
				dateTo: '2026-09-28',
			});
		},
		SUMMARY_CASE_TIMEOUT,
	);

	it('draws the rows at 100 or fewer, with no pager and no summary request', async () => {
		harness.page = { treatments: [TREATMENT], total: 1 };
		renderExplorer(ChemicalExplorer);

		expect(await screen.findByText('Ana Ortiz · Batch A-9, B-2')).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Go to next page' })).toBeNull();
		expect(harness.sent.some((url) => url.pathname === '/map/chemical/summary')).toBe(false);
	});

	// One row per Treatment: a two-product job is one row titled by both
	// products, measured in the same order, and opening the Treatment.
	it('draws a two-product Treatment as one row naming both products', async () => {
		seedRows(insecticides, [
			{ id: 'insecticide-1', trade_name: 'VectoBac 12AS' },
			{ id: 'insecticide-2', trade_name: 'Altosid XR-G' },
		]);
		harness.page = { treatments: [TREATMENT], total: 1 };
		renderExplorer(ChemicalExplorer);

		expect(await screen.findAllByText('VectoBac 12AS, Altosid XR-G')).toHaveLength(1);
		expect(screen.getByText('2, 4')).toBeTruthy();
		expect(screen.getByRole('heading', { name: /Treatments/ })).toBeTruthy();
	});
});

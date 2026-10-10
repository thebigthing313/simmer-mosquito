/** @vitest-environment jsdom */

/**
 * The Biocontrol Actions Table, rendered whole through `RecordSetTablePage`:
 * the rows, the empty state and the load-failure strip, and the request they
 * come from, which is the Map's own list request under a box around the
 * whole world (#1419).
 *
 * The router and transport fakes are `explorer-route-harness`'s, and the
 * component is preloaded first for the reason its docblock gives.
 */

import { cleanup, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { organizations } from '../../../../../lib/collections/organizations';
import type { MinimumRole } from '../../../../../lib/write-access';
import { installMemoryCollections, seedRows } from '../../../lib/collections/memory-collections';
import { preloadRouteComponent, renderExplorer } from '../../explorer-route-harness';

const harness = vi.hoisted(() => ({
	/** The search params a match would carry: the route's filters. */
	search: {} as Record<string, unknown>,
	/** Every request the route sent, in order. */
	sent: [] as URL[],
	/** Whether the list endpoint answers with a failure. */
	failing: false,
	/** What the list endpoint answers. */
	page: { biocontrolActions: [], total: 0 } as {
		readonly biocontrolActions: readonly unknown[];
		readonly total: number;
	},
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../../route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => harness.search);
});

vi.mock('@simmer-mosquito/sync', async (importOriginal) => {
	const { sessionFetchStandIn } = await import('../../route-mock-stand-ins');
	const answer = sessionFetchStandIn(harness.sent, () => harness.page);
	return {
		...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
		sessionFetch: async (input: URL | string) => {
			const response = await answer(input);
			return harness.failing ? ({ ok: false, status: 503 } as Response) : response;
		},
	};
});

vi.mock('../../../../../hooks/use-can-write', async () => {
	const { roleReaches } = await import('../../explorer-route-harness');
	return { useHasRole: (minimum: MinimumRole) => roleReaches('admin', minimum) };
});

let BiocontrolTable: () => ReactNode;

beforeAll(async () => {
	BiocontrolTable = await preloadRouteComponent(
		() => import('../../../../../routes/control-operations/biocontrol/table'),
		'biocontrol actions table',
	);
}, 300_000);

beforeEach(() => {
	installMemoryCollections();
	seedRows(organizations, [{ id: 'org-1', name: 'Test Mosquito Control', settings: {} }]);
	harness.search = {};
	harness.sent.length = 0;
	harness.failing = false;
	harness.page = { biocontrolActions: [], total: 0 };
});

afterEach(() => {
	cleanup();
});

const BIOCONTROL_ACTION = {
	id: 'biocontrol-action-1',
	lat: -0.5,
	lng: 0.5,
	biocontrolMethodId: 'method-1',
	biocontrolDate: '2026-09-20',
	amountReleased: 2,
	releaseUnitId: 'unit-1',
	technicianProfileId: null,
	habitatId: null,
	inspectionId: null,
};

describe('the biocontrol actions table', () => {
	it('draws a page of rows from the Map list request over the whole world', async () => {
		harness.search = { from: '2026-09-01', to: '2026-09-28', methods: ['method-1'] };
		harness.page = { biocontrolActions: [BIOCONTROL_ACTION], total: 1 };
		renderExplorer(BiocontrolTable);

		const view = await screen.findByRole('link', { name: 'View Unknown method' });
		expect(view.getAttribute('href')).toBe('/control-operations/biocontrol/biocontrol-action-1');
		expect(screen.getByRole('navigation', { name: 'Biocontrol actions view' })).toBeTruthy();
		const request = harness.sent.find((url) => url.pathname === '/map/biocontrol');
		expect(Object.fromEntries(request?.searchParams ?? [])).toMatchObject({
			bbox: '-180,-90,180,90',
			biocontrolMethodId: 'method-1',
			dateFrom: '2026-09-01',
			dateTo: '2026-09-28',
		});
	});

	it('draws the empty state when nothing matches what is set', async () => {
		harness.search = { methods: ['method-1'] };
		renderExplorer(BiocontrolTable);

		expect(await screen.findByText('No Biocontrol Actions Match')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Clear Filters' })).toBeTruthy();
	});

	it('draws the empty state for the window when nothing is set', async () => {
		renderExplorer(BiocontrolTable);

		expect(await screen.findByText('No Biocontrol Actions in the Last 90 Days')).toBeTruthy();
	});

	it('draws the load-failure strip and no empty state when the request fails', async () => {
		harness.failing = true;
		renderExplorer(BiocontrolTable);

		expect(await screen.findByText('Biocontrol actions could not be loaded.')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Try Again' })).toBeTruthy();
		expect(screen.queryByText('No Biocontrol Actions in the Last 90 Days')).toBeNull();
	});
});

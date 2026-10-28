/** @vitest-environment jsdom */

/**
 * The Export control on every record set's Map and Table: that each surface
 * draws it and reads `{path}/export` under its own page request, the Table's
 * over the whole world and the Map's over its viewport. What the file holds
 * and how a refusal reads are `inspections-export.test.tsx`'s, since the path
 * past the request is one hook for every set.
 *
 * The router, transport and canvas fakes are `explorer-route-harness`'s, and
 * every component is preloaded first for the reason its docblock gives.
 */

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { organizations } from '../../../lib/collections/organizations';
import type { MinimumRole } from '../../../lib/write-access';
import { installMemoryCollections, seedRows } from '../lib/collections/memory-collections';
import { preloadRouteComponent, renderExplorer, stubPanelLayout } from './explorer-route-harness';

const harness = vi.hoisted(() => ({
	/** The search a match would carry, one object so a store reading it settles. */
	search: {} as Record<string, unknown>,
	sent: [] as URL[],
	saved: [] as string[],
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('./route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => harness.search);
});

vi.mock('@simmer-mosquito/sync', async (importOriginal) => {
	const { sessionFetchStandIn } = await import('./route-mock-stand-ins');
	return {
		...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
		sessionFetch: sessionFetchStandIn(harness.sent, (url) => {
			if (url.pathname.endsWith('/extent')) {
				return { extent: { west: 0, south: -1, east: 1, north: 0 } };
			}
			if (url.pathname.endsWith('/export')) {
				return { headers: ['Name'], rows: [['One']] };
			}
			return { total: 0 };
		}),
	};
});

vi.mock('../../../lib/record-export', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../lib/record-export')>()),
	saveRecordExport: (_blob: Blob, fileName: string) => {
		harness.saved.push(fileName);
	},
}));

vi.mock('../../../hooks/use-can-write', async () => {
	const { roleReaches } = await import('./explorer-route-harness');
	return { useHasRole: (minimum: MinimumRole) => roleReaches('viewer', minimum) };
});

vi.mock('../../../components/map', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../components/map')>();
	const { MapCanvasStandIn } = await import('./explorer-route-harness');
	return { ...actual, MapCanvas: MapCanvasStandIn };
});

stubPanelLayout();

type RouteModule = Promise<{
	readonly Route: { readonly options: { readonly component?: unknown } };
}>;

/** Each set's list endpoint, the file it names, and its two routes. */
const SETS: readonly {
	readonly path: string;
	readonly file: string;
	readonly map: () => RouteModule;
	readonly table: () => RouteModule;
}[] = [
	{
		path: '/map/habitats',
		file: 'Habitats',
		map: () => import('../../../routes/larval-surveillance/habitats/index'),
		table: () => import('../../../routes/larval-surveillance/habitats/table'),
	},
	{
		path: '/map/samples',
		file: 'Samples',
		map: () => import('../../../routes/larval-surveillance/samples/index'),
		table: () => import('../../../routes/larval-surveillance/samples/table'),
	},
	{
		path: '/map/traps',
		file: 'Traps',
		map: () => import('../../../routes/adult-surveillance/traps/index'),
		table: () => import('../../../routes/adult-surveillance/traps/table'),
	},
	{
		path: '/map/collections',
		file: 'Collections',
		map: () => import('../../../routes/adult-surveillance/collections/index'),
		table: () => import('../../../routes/adult-surveillance/collections/table'),
	},
	{
		path: '/map/chemical',
		file: 'Chemical Applications',
		map: () => import('../../../routes/control-operations/chemical/index'),
		table: () => import('../../../routes/control-operations/chemical/table'),
	},
	{
		path: '/map/source-reduction',
		file: 'Source Reductions',
		map: () => import('../../../routes/control-operations/source-reduction/index'),
		table: () => import('../../../routes/control-operations/source-reduction/table'),
	},
	{
		path: '/map/biocontrol',
		file: 'Biocontrol Actions',
		map: () => import('../../../routes/control-operations/biocontrol/index'),
		table: () => import('../../../routes/control-operations/biocontrol/table'),
	},
	{
		path: '/map/outreach',
		file: 'Outreach Actions',
		map: () => import('../../../routes/public-engagement/outreach/index'),
		table: () => import('../../../routes/public-engagement/outreach/table'),
	},
	{
		path: '/map/service-requests',
		file: 'Service Requests',
		map: () => import('../../../routes/public-engagement/service-requests/index'),
		table: () => import('../../../routes/public-engagement/service-requests/table'),
	},
	{
		path: '/map/addresses',
		file: 'Addresses',
		map: () => import('../../../routes/gis/addresses/index'),
		table: () => import('../../../routes/gis/addresses/table'),
	},
];

const loaded = new Map<string, () => ReactNode>();

beforeAll(async () => {
	for (const set of SETS) {
		loaded.set(`${set.path} map`, await preloadRouteComponent(set.map, `${set.path} map`));
		loaded.set(`${set.path} table`, await preloadRouteComponent(set.table, `${set.path} table`));
	}
}, 600_000);

beforeEach(() => {
	installMemoryCollections();
	seedRows(organizations, [{ id: 'org-1', name: 'Test Mosquito Control', settings: {} }]);
	harness.sent.length = 0;
	harness.saved.length = 0;
});

afterEach(() => {
	cleanup();
});

/** Export the surface as CSV and answer the request it read, beside the page's. */
async function exportedBeside(path: string): Promise<{
	readonly exported: Record<string, string>;
	readonly page: Record<string, string>;
}> {
	const trigger = await screen.findByRole('button', { name: 'Export' });
	await waitFor(() => expect(trigger.hasAttribute('disabled')).toBe(false));
	fireEvent.pointerDown(
		trigger,
		new PointerEvent('pointerdown', { bubbles: true, ctrlKey: false, button: 0 }),
	);
	fireEvent.click(await screen.findByRole('menuitem', { name: 'CSV' }));
	await waitFor(() => expect(harness.saved).toHaveLength(1));

	const exported = harness.sent.find((url) => url.pathname === `${path}/export`);
	const page = harness.sent.find((url) => url.pathname === path);
	const pageParams = Object.fromEntries(page?.searchParams ?? []);
	delete pageParams.limit;
	delete pageParams.offset;
	return { exported: Object.fromEntries(exported?.searchParams ?? []), page: pageParams };
}

describe.each(SETS)('exporting $path', (set) => {
	it('exports every match from the Table, over the whole world', async () => {
		renderExplorer(loaded.get(`${set.path} table`) as () => ReactNode);

		const { exported, page } = await exportedBeside(set.path);

		expect(exported).toEqual(page);
		expect(exported.bbox).toBe('-180,-90,180,90');
		expect(harness.saved[0]).toMatch(new RegExp(`^${set.file} \\d{4}-\\d{2}-\\d{2}\\.csv$`));
	});

	it('exports the viewport and the filters from the Map', async () => {
		renderExplorer(loaded.get(`${set.path} map`) as () => ReactNode);

		const { exported, page } = await exportedBeside(set.path);

		expect(exported).toEqual(page);
		expect(exported.bbox).not.toBe('-180,-90,180,90');
	});
});

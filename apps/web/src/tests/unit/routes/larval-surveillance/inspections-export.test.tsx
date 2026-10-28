/** @vitest-environment jsdom */

/**
 * The Export control on the Inspections Table and the Inspections Map: that
 * each reads `/map/inspections/export` under its own page request, the Table's
 * over the whole world and the Map's over its viewport, that the answer is
 * saved as a file named for the records and the Organization's today, and that
 * a refusal over the ceiling raises its reason and saves nothing.
 *
 * The router, transport and canvas fakes are `explorer-route-harness`'s, and
 * both components are preloaded first for the reason its docblock gives.
 */

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { organizations } from '../../../../lib/collections/organizations';
import type { MinimumRole } from '../../../../lib/write-access';
import { installMemoryCollections, seedRows } from '../../lib/collections/memory-collections';
import { preloadRouteComponent, renderExplorer, stubPanelLayout } from '../explorer-route-harness';

const harness = vi.hoisted(() => ({
	search: {} as Record<string, unknown>,
	sent: [] as URL[],
	/** What the export endpoint answers, and with which status. */
	exported: { status: 200, body: {} as unknown },
	saved: [] as { readonly blob: Blob; readonly fileName: string }[],
	toasts: [] as { readonly title: string; readonly description?: string }[],
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => harness.search);
});

vi.mock('@simmer-mosquito/sync', async (importOriginal) => {
	const { sessionFetchStandIn } = await import('../route-mock-stand-ins');
	const answer = sessionFetchStandIn(harness.sent, (url) => {
		if (url.pathname.endsWith('/extent')) {
			return { extent: { west: 0, south: -1, east: 1, north: 0 } };
		}
		if (url.pathname.endsWith('/export')) {
			return harness.exported.body;
		}
		return { inspections: [], total: 0 };
	});
	return {
		...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
		sessionFetch: async (input: URL | string) => {
			const response = await answer(input);
			const url = input instanceof URL ? input : new URL(input);
			if (url.pathname.endsWith('/export') && harness.exported.status !== 200) {
				return { ...response, ok: false, status: harness.exported.status } as Response;
			}
			return response;
		},
	};
});

vi.mock('sonner', () => ({
	toast: {
		error: (title: string, options?: { readonly description?: string }) => {
			harness.toasts.push({
				title,
				...(options?.description ? { description: options.description } : {}),
			});
		},
	},
}));

vi.mock('../../../../lib/record-export', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../../lib/record-export')>()),
	saveRecordExport: (blob: Blob, fileName: string) => {
		harness.saved.push({ blob, fileName });
	},
}));

vi.mock('../../../../hooks/use-can-write', async () => {
	const { roleReaches } = await import('../explorer-route-harness');
	return { useHasRole: (minimum: MinimumRole) => roleReaches('viewer', minimum) };
});

vi.mock('../../../../components/map', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../../components/map')>();
	const { MapCanvasStandIn } = await import('../explorer-route-harness');
	return { ...actual, MapCanvas: MapCanvasStandIn };
});

stubPanelLayout();

let InspectionsTable: () => ReactNode;
let InspectionsMap: () => ReactNode;

beforeAll(async () => {
	InspectionsTable = await preloadRouteComponent(
		() => import('../../../../routes/larval-surveillance/inspections/table'),
		'inspections table',
	);
	InspectionsMap = await preloadRouteComponent(
		() => import('../../../../routes/larval-surveillance/inspections/index'),
		'inspections',
	);
}, 300_000);

beforeEach(() => {
	installMemoryCollections();
	seedRows(organizations, [{ id: 'org-1', name: 'Test Mosquito Control', settings: {} }]);
	harness.search = {};
	harness.sent.length = 0;
	harness.saved.length = 0;
	harness.toasts.length = 0;
	harness.exported = {
		status: 200,
		body: { headers: ['Inspection date', 'Density'], rows: [['2026-09-02', 'Heavy']] },
	};
});

afterEach(() => {
	cleanup();
});

/** Open the Export menu the way a pointer would, and pick `format`. */
async function exportAs(trigger: HTMLElement, format: 'CSV' | 'Excel workbook') {
	fireEvent.pointerDown(
		trigger,
		new PointerEvent('pointerdown', { bubbles: true, ctrlKey: false, button: 0 }),
	);
	fireEvent.click(await screen.findByRole('menuitem', { name: format }));
}

function sentTo(pathname: string): URL | undefined {
	return harness.sent.find((url) => url.pathname === pathname);
}

describe('exporting from the Inspections Table', () => {
	it('exports every match for the filters over the whole world, as CSV', async () => {
		harness.search = { density: ['heavy'], from: '2026-09-01' };
		renderExplorer(InspectionsTable);

		await exportAs(await screen.findByRole('button', { name: 'Export' }), 'CSV');

		await waitFor(() => expect(harness.saved).toHaveLength(1));
		const request = sentTo('/map/inspections/export');
		const page = sentTo('/map/inspections');
		expect(request?.searchParams.get('bbox')).toBe('-180,-90,180,90');
		expect(request?.searchParams.has('limit')).toBe(false);
		expect(request?.searchParams.has('offset')).toBe(false);
		const pageFilters = Object.fromEntries(page?.searchParams ?? []);
		delete pageFilters.limit;
		delete pageFilters.offset;
		expect(Object.fromEntries(request?.searchParams ?? [])).toEqual(pageFilters);
		expect(pageFilters).toMatchObject({ density: 'heavy', dateFrom: '2026-09-01' });

		const saved = harness.saved[0];
		expect(saved?.fileName).toMatch(/^Inspections \d{4}-\d{2}-\d{2}\.csv$/);
		// The byte order mark Excel reads UTF-8 by, which `Blob.text` decodes away.
		const bytes = new Uint8Array((await saved?.blob.arrayBuffer()) ?? new ArrayBuffer(0));
		expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
		expect(await saved?.blob.text()).toBe('Inspection date,Density\n2026-09-02,Heavy');
	});

	it('writes an Excel workbook that reads back as the rows', async () => {
		renderExplorer(InspectionsTable);

		await exportAs(await screen.findByRole('button', { name: 'Export' }), 'Excel workbook');

		await waitFor(() => expect(harness.saved).toHaveLength(1));
		const saved = harness.saved[0];
		expect(saved?.fileName).toMatch(/\.xlsx$/);
		const XLSX = await import('xlsx');
		const workbook = XLSX.read(await saved?.blob.arrayBuffer(), { type: 'array' });
		expect(workbook.SheetNames).toEqual(['Inspections']);
		const sheet = workbook.Sheets.Inspections;
		expect(sheet === undefined ? [] : XLSX.utils.sheet_to_json(sheet, { header: 1 })).toEqual([
			['Inspection date', 'Density'],
			['2026-09-02', 'Heavy'],
		]);
	});

	it('raises the refusal over the ceiling and saves nothing', async () => {
		const reason =
			'61,234 inspections match. Narrow the filters to 50,000 or fewer to export them.';
		harness.exported = {
			status: 422,
			body: { error: 'export_too_large', reason, total: 61234, ceiling: 50000 },
		};
		renderExplorer(InspectionsTable);

		await exportAs(await screen.findByRole('button', { name: 'Export' }), 'CSV');

		await waitFor(() =>
			expect(harness.toasts).toEqual([{ title: 'Inspections not exported', description: reason }]),
		);
		expect(harness.saved).toHaveLength(0);
	});
});

describe('exporting from the Inspections Map', () => {
	it('exports what the rail and the map show: the viewport plus the filters', async () => {
		harness.search = { density: ['heavy'] };
		renderExplorer(InspectionsMap);

		const trigger = await screen.findByRole('button', { name: 'Export' });
		await waitFor(() => expect(trigger.hasAttribute('disabled')).toBe(false));
		await exportAs(trigger, 'CSV');

		await waitFor(() => expect(harness.saved).toHaveLength(1));
		const request = sentTo('/map/inspections/export');
		const page = sentTo('/map/inspections');
		const pageFilters = Object.fromEntries(page?.searchParams ?? []);
		delete pageFilters.limit;
		delete pageFilters.offset;
		expect(pageFilters.bbox).not.toBe('-180,-90,180,90');
		expect(Object.fromEntries(request?.searchParams ?? [])).toEqual(pageFilters);
		expect(harness.saved[0]?.fileName).toMatch(/^Inspections \d{4}-\d{2}-\d{2}\.csv$/);
	});
});

/** @vitest-environment jsdom */

/**
 * The regions explorer, rendered whole over a fixture of folders and regions,
 * and read back as the tree a person sees (#937).
 *
 * This exists to measure that moving the fold and the search out of the route
 * changed nothing on screen. The snapshot under `__snapshots__` was written
 * against the route with both functions still inline, and the move is held to
 * it without an update; the two ordered readings beside it say what the
 * snapshot holds in words, so a diff in the file has a sentence to read.
 *
 * Both collections are eager reads off the memory collections, so nothing is
 * mocked below the hooks: the route runs its own `useRegionFolders` and
 * `useRegionDirectory` over seeded rows. What is faked is what
 * `addresses-viewport.test.tsx` fakes, for the reasons its docblock gives, and
 * the component is preloaded first for the reason `write-attribution.test.tsx`
 * gives.
 */

import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { organizations } from '../../../../../lib/collections/organizations';
import { region_folders } from '../../../../../lib/collections/region_folders';
import { regions } from '../../../../../lib/collections/regions';
import type { MinimumRole } from '../../../../../lib/write-access';
import { installMemoryCollections, seedRows } from '../../../lib/collections/memory-collections';
import {
	preloadRouteComponent,
	renderExplorer,
	stubPanelLayout,
} from '../../explorer-route-harness';

const harness = vi.hoisted(() => ({
	/** The search params a match would carry: the route's one filter. */
	search: {} as Record<string, unknown>,
	/** Every request the route sent, in order. */
	sent: [] as URL[],
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../../route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => harness.search);
});

// The canvas asks the extent endpoint to frame the ticked regions, and nothing
// else on this surface leaves the browser until a region is focused.
vi.mock('@simmer-mosquito/sync', async (importOriginal) => {
	const { sessionFetchStandIn } = await import('../../route-mock-stand-ins');
	return {
		...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
		sessionFetch: sessionFetchStandIn(harness.sent, () => ({ extent: null })),
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

const ORG = 'a1b2c3d4-0000-4000-8000-00000000000a';

function folderRow(id: string, name: string, description: string | null) {
	return {
		id,
		organization_id: ORG,
		name,
		description,
		created_at: new Date('2026-01-01T00:00:00Z'),
		updated_at: new Date('2026-01-01T00:00:00Z'),
		deleted_at: null,
	};
}

function regionRow(id: string, name: string, folderId: string | null) {
	return {
		id,
		organization_id: ORG,
		region_folder_id: folderId,
		name,
		description: null,
		geom_type: 'Polygon',
		lat: 40.3,
		lng: -74.4,
		created_at: new Date('2026-01-01T00:00:00Z'),
		updated_at: new Date('2026-01-01T00:00:00Z'),
		deleted_at: null,
	};
}

/**
 * Seeded out of alphabetical order on purpose: the tree sorts folders by name
 * and the directory sorts regions by name, so the reading below is what the
 * two sorts produce and not what the fixture wrote.
 */
const FOLDERS = [
	folderRow('f1b2c3d4-0000-4000-8000-000000000002', 'South side', null),
	folderRow('f1b2c3d4-0000-4000-8000-000000000001', 'North side', 'Everything above the river'),
	folderRow('f1b2c3d4-0000-4000-8000-000000000003', 'Unused', null),
];
const REGIONS = [
	regionRow(
		'e1b2c3d4-0000-4000-8000-000000000004',
		'Pine Ct',
		'f1b2c3d4-0000-4000-8000-000000000002',
	),
	regionRow(
		'e1b2c3d4-0000-4000-8000-000000000002',
		'Oak Ave',
		'f1b2c3d4-0000-4000-8000-000000000001',
	),
	regionRow(
		'e1b2c3d4-0000-4000-8000-000000000001',
		'Elm St',
		'f1b2c3d4-0000-4000-8000-000000000001',
	),
	regionRow(
		'e1b2c3d4-0000-4000-8000-000000000003',
		'Elmwood Park',
		'f1b2c3d4-0000-4000-8000-000000000002',
	),
	regionRow('e1b2c3d4-0000-4000-8000-000000000006', 'River walk', null),
	regionRow('e1b2c3d4-0000-4000-8000-000000000005', 'Elm Loop', null),
];

let RegionsExplorer: () => ReactNode;

beforeAll(async () => {
	RegionsExplorer = await preloadRouteComponent(
		() => import('../../../../../routes/gis/regions/index'),
		'regions',
	);
}, 300_000);

beforeEach(() => {
	installMemoryCollections();
	seedRows(organizations, [{ id: ORG, name: 'Test Mosquito Control', settings: {} }]);
	seedRows(region_folders, FOLDERS);
	seedRows(regions, REGIONS);
	harness.search = {};
	harness.sent.length = 0;
});

afterEach(() => {
	cleanup();
});

/** The tree body: the element holding every folder and the unfiled group. */
function treeBody(): HTMLElement {
	const unfiled = screen.getByText('Unfiled');
	const body = unfiled.closest('.p-2');
	if (!(body instanceof HTMLElement)) {
		throw new Error('the tree body is not on the page');
	}
	return body;
}

/**
 * What the tree says, top to bottom: each folder header with its count, and
 * each region row, in document order. A region is listed under whichever
 * header precedes it, which is what a reader takes from the indent.
 */
function readTree(): readonly string[] {
	const lines: string[] = [];
	const headersAndRows = treeBody().querySelectorAll(
		'p.font-medium.text-sm, span.uppercase, button[title="Show on the Map"]',
	);
	for (const element of headersAndRows) {
		if (element.tagName === 'BUTTON') {
			lines.push(`  ${element.textContent}`);
			continue;
		}
		// A folder's name sits in a block inside its header row; the unfiled
		// heading is a span directly in its row. The count badge is in the row.
		const row =
			element.tagName === 'P' ? element.parentElement?.parentElement : element.parentElement;
		const count = row?.querySelector('[data-slot="badge"]')?.textContent?.trim();
		lines.push(`${element.textContent?.trim()} (${count})`);
	}
	return lines;
}

describe('the regions tree as rendered', () => {
	it('lists every folder collapsed, then the unfiled regions', async () => {
		renderExplorer(RegionsExplorer);

		await screen.findByText('North side');
		expect(readTree()).toEqual([
			'North side (2)',
			'South side (2)',
			'Unused (0)',
			'Unfiled (2)',
			'  Elm Loop',
			'  River walk',
		]);
		expect(treeBody()).toMatchSnapshot();
	});

	it('shows the regions of a folder once it is expanded', async () => {
		renderExplorer(RegionsExplorer);

		await screen.findByText('North side');
		for (const trigger of screen.getAllByRole('button', { name: 'Expand folder' })) {
			fireEvent.click(trigger);
		}

		expect(readTree()).toEqual([
			'North side (2)',
			'  Elm St',
			'  Oak Ave',
			'South side (2)',
			'  Elmwood Park',
			'  Pine Ct',
			'Unused (0)',
			'Unfiled (2)',
			'  Elm Loop',
			'  River walk',
		]);
		expect(treeBody()).toMatchSnapshot();
	});

	// The second level of the search: neither folder matched, so each keeps the
	// regions that did, the folder with none drops out, and a search opens
	// every folder it kept.
	it('narrows to the matching regions and opens what it kept', async () => {
		harness.search = { search: 'elm' };
		renderExplorer(RegionsExplorer);

		await screen.findByText('Elm St');
		expect(readTree()).toEqual([
			'North side (1)',
			'  Elm St',
			'South side (1)',
			'  Elmwood Park',
			'Unfiled (1)',
			'  Elm Loop',
		]);
		expect(treeBody()).toMatchSnapshot();
	});

	// The first level: the folder matched, so Oak Ave is kept under it even
	// though the term is nowhere in its name.
	it('keeps a whole folder whose name matches', async () => {
		harness.search = { search: 'north' };
		renderExplorer(RegionsExplorer);

		await screen.findByText('Oak Ave');
		expect(readTree()).toEqual(['North side (2)', '  Elm St', '  Oak Ave', 'Unfiled (0)']);
		expect(treeBody()).toMatchSnapshot();
	});
});

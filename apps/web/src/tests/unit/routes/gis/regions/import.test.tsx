/** @vitest-environment jsdom */

/**
 * The Region import page while an import runs and once it has handed its rows
 * to the server (#1285).
 *
 * A find-and-replace that turned collection references into calls also
 * rewrote the word `regions` inside three pieces of this page's copy, so the
 * progress line read `Importing regions()…` and the pending-sync alert said
 * `regions() were` and `regions() list`. No gate reads a noun inside a longer
 * sentence, so these cases are what hold the copy.
 *
 * The file parse and the write hook are stood in: the parse because what the
 * page draws depends on how many boundaries came back and not on the file,
 * and the hook because the cases need a write that never settles and one whose
 * confirmation times out. The rest is what `regions-tree-render.test.tsx`
 * fakes, and the component is preloaded first for the reason
 * `write-attribution.test.tsx` gives.
 */

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	ParseResult,
	RegionBoundary,
} from '../../../../../components/gis/regions/import-parse';
import { organizations } from '../../../../../lib/collections/organizations';
import { installMemoryCollections, seedRows } from '../../../lib/collections/memory-collections';
import {
	preloadRouteComponent,
	renderExplorer,
	stubPanelLayout,
} from '../../explorer-route-harness';

const harness = vi.hoisted(() => ({
	/** What each write's `isPersisted.promise` does, set per case. */
	persisted: (): Promise<void> => new Promise<void>(() => {}),
	sent: [] as URL[],
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../../route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => ({}));
});

vi.mock('@simmer-mosquito/sync', async (importOriginal) => {
	const { sessionFetchStandIn } = await import('../../route-mock-stand-ins');
	return {
		...(await importOriginal<typeof import('@simmer-mosquito/sync')>()),
		sessionFetch: sessionFetchStandIn(harness.sent, () => ({ extent: null })),
	};
});

vi.mock('@simmer-mosquito/mapping', async (importOriginal) => ({
	...(await importOriginal<typeof import('@simmer-mosquito/mapping')>()),
	readImportFileText: async () => '',
}));

vi.mock('../../../../../components/gis/regions/import-parse', async (importOriginal) => {
	const actual =
		await importOriginal<typeof import('../../../../../components/gis/regions/import-parse')>();
	const square: RegionBoundary = {
		type: 'Polygon',
		coordinates: [
			[
				[-74.4, 40.3],
				[-74.3, 40.3],
				[-74.3, 40.4],
				[-74.4, 40.3],
			],
		],
	};
	const result: ParseResult = {
		regions: [
			{ name: 'Elm St', geometry: square, note: null },
			{ name: 'Oak Ave', geometry: square, note: null },
		],
		skipped: 0,
		multipart: 0,
		mixed: 0,
		truncated: false,
		projected: 0,
	};
	return { ...actual, parseRegionsFromFile: () => result };
});

vi.mock('../../../../../hooks/mutations/use-region-mutations', () => ({
	useRegionMutations: () => ({
		canWrite: true,
		create: () => ({ isPersisted: { promise: harness.persisted() } }),
	}),
}));

vi.mock('../../../../../hooks/queries/use-region-folders', () => ({
	useRegionFolders: () => ({ folders: [] }),
}));

vi.mock('../../../../../components/map', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../../../../components/map')>();
	const { MapCanvasStandIn } = await import('../../explorer-route-harness');
	return { ...actual, MapCanvas: MapCanvasStandIn };
});

stubPanelLayout();

const ORG = 'a1b2c3d4-0000-4000-8000-00000000000a';

let ImportRegions: () => ReactNode;

beforeAll(async () => {
	ImportRegions = await preloadRouteComponent(
		() => import('../../../../../routes/gis/regions/import'),
		'region import',
	);
}, 300_000);

beforeEach(() => {
	installMemoryCollections();
	seedRows(organizations, [{ id: ORG, name: 'Test Mosquito Control', settings: {} }]);
	harness.persisted = () => new Promise<void>(() => {});
	harness.sent.length = 0;
});

afterEach(() => {
	cleanup();
});

/** Upload a file, wait for the review list, and start the import. */
async function startImport(): Promise<void> {
	renderExplorer(ImportRegions);
	const input = document.querySelector('input[type="file"]');
	if (!(input instanceof HTMLInputElement)) {
		throw new Error('the file input is not on the page');
	}
	fireEvent.change(input, {
		target: { files: [new File(['{}'], 'regions.geojson', { type: 'application/geo+json' })] },
	});
	fireEvent.click(await screen.findByRole('button', { name: 'Import 2 regions' }));
}

describe('the region import page', () => {
	it('says what it is importing while the writes are in flight', async () => {
		await startImport();

		expect(await screen.findByText('Importing regions…')).toBeTruthy();
		expect(document.body.textContent).not.toContain('()');
	});

	it('says the regions were saved when their sync is not confirmed', async () => {
		harness.persisted = () => {
			const timeout = new Error('timed out waiting for the txid');
			timeout.name = 'TimeoutWaitingForTxIdError';
			return Promise.reject(timeout);
		};
		await startImport();

		await waitFor(() => {
			expect(document.body.textContent).toContain('2 regions were saved, awaiting sync');
		});
		expect(document.body.textContent).toContain('should appear on the regions list shortly.');
		expect(document.body.textContent).not.toContain('()');
	});
});

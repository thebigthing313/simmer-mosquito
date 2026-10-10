/** @vitest-environment jsdom */

/**
 * What the Chemical Application detail page calls an application whose
 * Insecticide is not in the client.
 *
 * `productName` is the joined Insecticide's trade name, so it reads `null`
 * when that Insecticide never reached the client. The page used to fall back
 * to `Unknown product` for the heading, the breadcrumb and the page title,
 * while the overview, the explorer, the Habitat history, the Inspection detail
 * page and the Formulations page all read `Unknown insecticide` for the same
 * record (#1537).
 *
 * The route module's `Route` hands back the params a match would and the
 * route context a signed-in Manager carries. The record comes from a stand-in
 * for the query hook, since what the page draws for a record it already holds
 * is the question. The map card, the regions band, the comments column, the
 * personnel list and the address row are stand-ins because none of them is
 * in the question and Mapbox GL has no jsdom.
 */

import { TooltipProvider } from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { type ReactNode, Suspense } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChemicalApplication } from '../../../../../hooks/queries/control-action-view';
import { installMemoryCollections } from '../../../lib/collections/memory-collections';
import { preloadRouteComponent } from '../../explorer-route-harness';

const page = vi.hoisted(() => ({
	/** The application the page is handed. */
	application: undefined as ChemicalApplication | undefined,
	/** Every label the page handed the breadcrumb, in order. */
	breadcrumbs: [] as string[],
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn, signedInSnapshotAs } = await import('../../route-mock-stand-ins');
	const params = { id: 'a1' };
	const context = { auth: { snapshot: signedInSnapshotAs('manager', 'org-1') } };
	const standIn = routerStandIn(
		await importOriginal<object>(),
		() => ({}),
		() => params,
	);
	return {
		...standIn,
		createFileRoute: () => (options: Record<string, unknown>) => ({
			...standIn.createFileRoute()(options),
			useRouteContext: () => context,
		}),
	};
});

vi.mock('../../../../../components/app-shell', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useBreadcrumbLabel: (_id: string, label: string) => {
		page.breadcrumbs.push(label);
	},
}));

vi.mock('../../../../../hooks/queries/use-application', () => ({
	useApplication: () => ({ application: page.application, isReady: true, isError: false }),
}));

vi.mock('../../../../../hooks/queries/use-application-batches', () => ({
	useApplicationBatches: () => ({ rows: [], isReady: true, isError: false }),
}));

vi.mock('../../../../../hooks/queries/use-catalog-roster', () => ({
	useCatalogRoster: () => [],
}));

vi.mock('../../../../../hooks/queries/use-habitat-names', () => ({
	useHabitatNames: () => new Map<string, string>(),
}));

vi.mock('../../../../../hooks/mutations/use-application-mutations', () => ({
	useApplicationMutations: () => ({
		remove: async () => {},
		addBatch: async () => {},
		removeBatch: async () => {},
	}),
}));

vi.mock('../../../../../components/comments-section', () => ({
	CommentsSection: () => <p>comments</p>,
}));

vi.mock('../../../../../components/additional-personnel-list', () => ({
	AdditionalPersonnelList: () => null,
}));

vi.mock('../../../../../components/linked-address', () => ({
	LinkedAddressValueById: () => null,
}));

vi.mock('../../../../../components/map/record-location-card', () => ({
	RecordLocationCard: () => <p>location card</p>,
}));

vi.mock('../../../../../components/map/record-regions-band', () => ({
	RecordRegionsBand: () => <p>regions band</p>,
}));

vi.mock('../../../../../hooks/use-owned-geometry', async (importOriginal) => ({
	...(await importOriginal<object>()),
	useOwnedGeometry: () => ({
		geojson: null,
		geomType: null,
		isError: false,
		isPending: false,
		unsupportedShape: false,
	}),
}));

vi.mock('../../../../../hooks/use-habitat-location-context', () => ({
	useHabitatLocationContext: () => undefined,
}));

let ApplicationDetail: () => ReactNode;

beforeAll(async () => {
	ApplicationDetail = await preloadRouteComponent(
		() => import('../../../../../routes/control-operations/chemical/$id'),
		'chemical application detail',
	);
}, 300_000);

beforeEach(() => {
	installMemoryCollections();
	page.breadcrumbs.length = 0;
});

afterEach(cleanup);

const CREATED_AT = new Date('2026-08-04T12:00:00Z');

function application(overrides: Partial<ChemicalApplication>): ChemicalApplication {
	return {
		id: 'a1',
		actionDate: '2026-08-04',
		addressId: null,
		address: {
			id: undefined,
			displayName: undefined,
			addressLine1: undefined,
			addressLine2: undefined,
			locality: undefined,
			region: undefined,
			postalCode: undefined,
		},
		habitatId: null,
		inspectionId: null,
		requestedControlActionId: null,
		missionItemId: null,
		latitude: 40.1,
		longitude: -74.2,
		geometryKind: 'Point',
		metadata: {},
		createdAt: CREATED_AT,
		updatedAt: CREATED_AT,
		createdByProfileId: null,
		updatedByProfileId: null,
		insecticideId: 'product',
		productName: 'VectoBac 12AS',
		methodId: null,
		methodName: null,
		applicatorProfileId: null,
		applicatorName: null,
		amountApplied: 12,
		unitId: 'unit',
		unitAbbreviation: 'gal',
		vehicleId: null,
		vehicleName: null,
		equipmentId: null,
		equipmentName: null,
		collectionId: null,
		...overrides,
	};
}

async function renderPage(record: ChemicalApplication, heading: string): Promise<void> {
	page.application = record;
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<TooltipProvider>
				<Suspense fallback={<span>loading</span>}>
					<ApplicationDetail />
				</Suspense>
			</TooltipProvider>
		</QueryClientProvider>,
	);
	await screen.findByRole('heading', { level: 1, name: heading });
}

describe('the Chemical Application detail page', () => {
	it('names the application after its Insecticide when the Insecticide is in the client', async () => {
		await renderPage(application({}), 'VectoBac 12AS');

		expect(page.breadcrumbs).toContain('VectoBac 12AS');
	});

	it('reads Unknown insecticide when the Insecticide is not in the client', async () => {
		await renderPage(application({ productName: null }), 'Unknown insecticide');

		expect(page.breadcrumbs).toContain('Unknown insecticide');
	});
});

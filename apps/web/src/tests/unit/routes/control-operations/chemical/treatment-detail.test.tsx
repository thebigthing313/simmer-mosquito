/** @vitest-environment jsdom */

/**
 * What the Treatment detail page calls a Treatment, and what it lists under it.
 *
 * The heading is the Treatment's products in line order (#1753). A line's
 * `insecticideName` is the joined Insecticide's trade name, so it reads `null`
 * when that Insecticide never reached the client, and the page reads
 * `Unknown insecticide` as every other surface does for the same record
 * (#1537).
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
import type { TreatmentDetail } from '../../../../../hooks/queries/control-action-view';
import type { TreatmentLine } from '../../../../../hooks/queries/treatment-lines';
import { installMemoryCollections } from '../../../lib/collections/memory-collections';
import { preloadRouteComponent } from '../../explorer-route-harness';

const page = vi.hoisted(() => ({
	/** The Treatment the page is handed. */
	treatment: undefined as TreatmentDetail | undefined,
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

vi.mock('../../../../../hooks/queries/use-treatment', () => ({
	useTreatment: () => ({ treatment: page.treatment, isReady: true, isError: false }),
}));

vi.mock('../../../../../hooks/queries/use-application-batch-names', () => ({
	useApplicationBatchNames: (lineId: string) => (lineId === 'line-1' ? ['B-7', 'B-9'] : []),
}));

vi.mock('../../../../../hooks/queries/use-catalog-roster', () => ({
	useCatalogRoster: () => [],
}));

vi.mock('../../../../../hooks/queries/use-habitat-names', () => ({
	useHabitatNames: () => new Map<string, string>(),
}));

vi.mock('../../../../../hooks/mutations/use-treatment-mutations', () => ({
	useTreatmentMutations: () => ({ remove: async () => {} }),
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

let TreatmentDetailPage: () => ReactNode;

beforeAll(async () => {
	TreatmentDetailPage = await preloadRouteComponent(
		() => import('../../../../../routes/control-operations/chemical/$id'),
		'treatment detail',
	);
}, 300_000);

beforeEach(() => {
	installMemoryCollections();
	page.breadcrumbs.length = 0;
});

afterEach(cleanup);

const CREATED_AT = new Date('2026-08-04T12:00:00Z');

function line(overrides: Partial<TreatmentLine>): TreatmentLine {
	return {
		id: 'line-1',
		insecticideId: 'product',
		insecticideName: 'VectoBac 12AS',
		amount: 12,
		unitId: 'unit',
		unitAbbreviation: 'gal',
		...overrides,
	};
}

function treatment(overrides: Partial<TreatmentDetail>): TreatmentDetail {
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
		methodId: null,
		methodName: null,
		applicatorProfileId: null,
		applicatorName: null,
		vehicleId: null,
		vehicleName: null,
		equipmentId: null,
		equipmentName: null,
		collectionId: null,
		formulationId: null,
		formulationName: null,
		mixAmount: null,
		mixUnitId: null,
		mixUnitAbbreviation: null,
		lines: [line({})],
		...overrides,
	};
}

async function renderPage(record: TreatmentDetail, heading: string): Promise<void> {
	page.treatment = record;
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<TooltipProvider>
				<Suspense fallback={<span>loading</span>}>
					<TreatmentDetailPage />
				</Suspense>
			</TooltipProvider>
		</QueryClientProvider>,
	);
	await screen.findByRole('heading', { level: 1, name: heading });
}

describe('the Treatment detail page', () => {
	it('names the Treatment after its Insecticide when the Insecticide is in the client', async () => {
		await renderPage(treatment({}), 'VectoBac 12AS');

		expect(page.breadcrumbs).toContain('VectoBac 12AS');
		expect(screen.getAllByText('Treatment').length).toBeGreaterThan(0);
	});

	it('reads Unknown insecticide when the Insecticide is not in the client', async () => {
		await renderPage(
			treatment({ lines: [line({ insecticideName: null })] }),
			'Unknown insecticide',
		);

		expect(page.breadcrumbs).toContain('Unknown insecticide');
	});

	it('names every product in line order and lists each with its amount and batches', async () => {
		await renderPage(
			treatment({
				lines: [
					line({}),
					line({
						id: 'line-2',
						insecticideName: 'Altosid XR-G',
						amount: 4,
						unitAbbreviation: 'oz',
					}),
				],
			}),
			'VectoBac 12AS, Altosid XR-G',
		);

		expect(screen.getByText('12 gal, 4 oz · Aug 4, 2026')).toBeDefined();
		expect(screen.getByText('B-7, B-9')).toBeDefined();
		expect(screen.getByText('2 products')).toBeDefined();
	});

	it('names the Formulation a Treatment was mixed from, with the mix total', async () => {
		await renderPage(
			treatment({
				formulationId: 'f1',
				formulationName: 'Mix A',
				mixAmount: 78,
				mixUnitId: 'u1',
				mixUnitAbbreviation: 'gal',
			}),
			'VectoBac 12AS',
		);

		expect(screen.getByText('From 78 gal of Mix A')).toBeDefined();
	});
});

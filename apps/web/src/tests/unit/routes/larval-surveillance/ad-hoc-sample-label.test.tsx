/** @vitest-environment jsdom */

/**
 * What the three sample surfaces call a sample that sits at no habitat.
 *
 * A sample with no habitat and no centroid has nothing to title it, so each of
 * these surfaces reaches `adhocLabel` and draws the words it falls back to.
 * That fallback used to be defaulted to `Ad-hoc inspection`, one record kind's
 * category name, and all three took the default: the samples explorer row, the
 * sample map card and the Awaiting Identification panel on the larval overview
 * named a sample after a different record (#953).
 *
 * Each case renders the real call site rather than calling the formatter, which
 * is the half a unit test of `adhocLabel` cannot cover: the bug was never in the
 * formatter, it was in what three call sites asked it for. A fourth case renders
 * the inspection map card, because the other three callers were right on the
 * default and the required argument has to leave them as they were.
 *
 * ## What is faked, and why none of it is the assertion
 *
 * The mocks get three surfaces to draw in jsdom; the words under test come from
 * the route modules themselves. `createFileRoute` is replaced so a route's
 * `Route` hands back the search a match would, and `Link` becomes an anchor, so
 * no router is mounted and no route tree is imported, which is the cost
 * `link-destinations.test.tsx` exists to pay once. `ExplorerMapPage` is replaced
 * by a stand-in that draws the rows its `results` prop carries, so the explorer
 * row is the real one and the Mapbox canvas beside it never renders. The
 * remaining mocks are the data hooks, each answering with one sample that has
 * no habitat and no centroid.
 */

import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** The one sample every surface below is asked to name. */
const AD_HOC = {
	id: 'sample-00000000-0000-4000-8000-000000000001',
	displayName: null,
	name: null,
	inspectionId: 'inspection-1',
	inspectionDate: '2026-09-01',
	habitatId: null,
	habitatName: null,
	lat: null,
	lng: null,
	latitude: null,
	longitude: null,
	geomType: null,
	geometryKind: null,
	isZeroLarvae: false,
	hasNonMosquito: false,
	unidentifiableReason: null,
	status: 'awaiting',
	identifiedAt: null,
	larvaeTotal: 0,
	results: [],
} as const;

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/react-router')>();
	return {
		...actual,
		createFileRoute: () => (options: Record<string, unknown>) => ({
			...options,
			options,
			useSearch: () => ({}),
			useParams: () => ({}),
			useRouteContext: () => ({}),
		}),
		Link: ({ children }: { readonly children: ReactNode }) => <a href="/">{children}</a>,
		useSearch: () => ({}),
		useNavigate: () => async () => undefined,
	};
});

vi.mock('../../../../hooks/use-organization-time-zone', () => ({
	useOrganizationTimeZone: () => 'America/Los_Angeles',
}));

// --- the samples explorer ----------------------------------------------------

vi.mock('../../../../components/explorer', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	ExplorerMapPage: ({
		results,
	}: {
		readonly results: {
			readonly rows: readonly unknown[];
			readonly renderRow: (row: unknown) => ReactNode;
		};
	}) => <div>{results.rows.map((row) => results.renderRow(row))}</div>,
}));

vi.mock('../../../../hooks/explorer/use-explorer-panel', () => ({
	useExplorerPanel: () => ({ inset: undefined, width: 0 }),
}));
vi.mock('../../../../hooks/explorer/use-date-range-filters', () => ({
	useDateRangeFilters: () => ({}),
}));
vi.mock('../../../../hooks/explorer/use-explorer-resource', () => ({
	useExplorerResource: () => ({
		rows: [AD_HOC],
		total: 1,
		isLoading: false,
		isError: false,
		retry: () => undefined,
		page: 1,
		pageCount: 1,
		setPage: () => undefined,
		selected: null,
	}),
}));
vi.mock('../../../../hooks/explorer/use-region-options', () => ({
	useRegionOptions: () => ({ options: [], nameById: new Map() }),
}));
vi.mock('../../../../hooks/explorer/use-species-options', () => ({
	useSpeciesOptions: () => ({ options: [], nameById: new Map() }),
}));

// --- the sample map card -----------------------------------------------------

vi.mock('../../../../hooks/queries/use-sample', () => ({
	useSample: () => ({ sample: AD_HOC, isReady: true, isError: false }),
}));

vi.mock('../../../../hooks/queries/use-sample-identifications', () => ({
	useSampleIdentifications: () => ({ identifications: [], isReady: true }),
}));

// --- the larval overview -----------------------------------------------------

vi.mock('../../../../hooks/larval-surveillance/use-samples-awaiting', () => ({
	useSamplesAwaiting: () => ({
		samples: [AD_HOC],
		total: 1,
		isLoading: false,
		isError: false,
	}),
}));
vi.mock('../../../../hooks/larval-surveillance/use-species-composition', () => ({
	useSpeciesComposition: () => ({ totals: [], grandTotal: 0, isReady: true, isError: false }),
}));

vi.mock('../../../../hooks/queries/use-larval-activity-for-date', () => ({
	useLarvalActivityForDate: () => ({ rows: [], isReady: true, isError: false }),
}));

// --- the inspection map card, which is the record kind the default was right for

/**
 * An inspection at no habitat, with no centroid.
 *
 * The other three callers of `adhocLabel` are inspection surfaces and were
 * right on the default, so the last case renders one of them: the required
 * argument has to leave them saying what they said before.
 */
const AD_HOC_INSPECTION = {
	id: 'inspection-00000000-0000-4000-8000-000000000002',
	inspectionDate: '2026-09-01',
	habitatId: null,
	habitatName: null,
	habitatTypeId: null,
	typeName: null,
	latitude: null,
	longitude: null,
	geometryKind: null,
	isWet: false,
	density: null,
	larvaeCount: null,
	inspectedByName: null,
	notes: null,
	address: {
		id: undefined,
		displayName: undefined,
		addressLine1: undefined,
		addressLine2: undefined,
		locality: undefined,
		region: undefined,
		postalCode: undefined,
	},
	hasEggs: false,
	hasFirstInstar: false,
	hasSecondInstar: false,
	hasThirdInstar: false,
	hasFourthInstar: false,
	hasPupae: false,
} as const;

vi.mock('../../../../hooks/queries/use-inspection', () => ({
	useInspection: () => ({ inspection: AD_HOC_INSPECTION, isReady: true, isError: false }),
}));

vi.mock('../../../../hooks/queries/use-heavy-larval-activity', () => ({
	useHeavyLarvalActivity: () => ({ rows: [], isReady: true, isError: false }),
}));

afterEach(cleanup);

/** The lazy stand-in the router plugin leaves behind in `component`. */
type SplitComponent = (() => ReactNode) & { readonly preload?: () => Promise<unknown> };

/**
 * A route's component, already imported.
 *
 * `autoCodeSplitting` rewrites `component` into a lazy stand-in, so rendering
 * one suspends on an import that pulls the route's whole dependency tree. Every
 * case awaits the preload before it renders, rather than letting the render
 * overrun a timeout and report a component that drew nothing.
 */
async function routeComponent(module: {
	readonly Route: { readonly options: { readonly component?: unknown } };
}): Promise<() => ReactNode> {
	const component = module.Route.options.component as SplitComponent;
	await component.preload?.();
	return component;
}

describe('a sample at no habitat, with no centroid', () => {
	it('is named a sample by the samples explorer row', async () => {
		const module = await import('../../../../routes/larval-surveillance/samples/index');
		const Component = await routeComponent(module);
		render(<Component />);

		expect(screen.getByText('Ad-hoc sample')).toBeDefined();
		expect(screen.queryByText('Ad-hoc inspection')).toBeNull();
	}, 300_000);

	it('is named a sample by the sample map card', async () => {
		const { SampleMapCard } = await import(
			'../../../../components/larval-surveillance/sample-map-card'
		);
		render(<SampleMapCard id={AD_HOC.id} onClose={() => undefined} />);

		expect(screen.getByText('Ad-hoc sample')).toBeDefined();
		expect(screen.queryByText('Ad-hoc inspection')).toBeNull();
	}, 300_000);

	it('is named a sample by the larval overview', async () => {
		const module = await import('../../../../routes/larval-surveillance/index');
		const Component = await routeComponent(module);
		render(<Component />);

		expect(await screen.findByText('Ad-hoc sample')).toBeDefined();
		expect(screen.queryByText('Ad-hoc inspection')).toBeNull();
	}, 300_000);

	it('leaves the inspection map card beside it naming an inspection', async () => {
		const { InspectionMapCard } = await import(
			'../../../../components/larval-surveillance/inspection-map-card'
		);
		render(<InspectionMapCard id={AD_HOC_INSPECTION.id} onClose={() => undefined} />);

		expect(screen.getByText('Ad-hoc inspection')).toBeDefined();
		expect(screen.queryByText('Ad-hoc sample')).toBeNull();
	}, 300_000);
});

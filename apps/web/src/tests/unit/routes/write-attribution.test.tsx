/** @vitest-environment jsdom */

/**
 * Every route that gates its submit on the write-attribution predicate.
 *
 * `canAttributeWrite` asks whether there is an Organization and an actor Profile
 * to record a write against. Fourteen route components call it and hand the
 * answer to their form as `canSubmit`, and since #898 narrowed
 * `useOrganizationWorkspace` the Organization half is never absent at a route,
 * so what each of these sites really reads is the actor Profile alone.
 *
 * The predicate has had its own case since #899. What nothing covered was the
 * wiring: a route that stopped calling it, or passed `true` beside it, failed no
 * gate, because `tsc` is happy with any boolean and the three static gates over
 * this app read colours, copy and hooks rather than props. This file is the
 * table, so a fifteenth site is one row.
 *
 * ## Both directions, per row
 *
 * A case asserting only "no Profile disables the submit" passes for a route that
 * hardcodes `false`, and passes just as happily for a probe that never received
 * the prop at all. So every row runs twice, and the second run is what says the
 * value came from the snapshot rather than from nowhere.
 *
 * ## What is faked, and why none of it is the assertion
 *
 * The mocks below exist to get fourteen components to render in jsdom, not to
 * supply the answer. Three of them are worth the note:
 *
 * - `createFileRoute` is replaced so a route module's `Route` hands back the
 *   context, params and search a match would. Rendering these through a real
 *   `RouterProvider` would run each route's `beforeLoad`, which is the role
 *   floor and a different question (`isBelowWriteFloor`, covered by
 *   `check:write-surfaces` and its own suites). It also means this file imports
 *   no route tree, which is the cost `link-destinations.test.tsx` is a single
 *   file to avoid paying twice. What it does pay is fourteen route modules, and
 *   that is the same argument: one file, fourteen rows.
 * - The eight form-page modules keep every export but their `*FormPage`, which
 *   becomes {@link SubmitProbe}. The real ones draw a Mapbox canvas, and what
 *   this file reads is the prop they are handed.
 * - `RecordEditFrame` is replaced for the six edit routes, whose `canSubmit` is
 *   computed in the outer component and handed to a loader the frame renders
 *   only once the record is in hand. The stand-in calls the frame's child
 *   function and draws the probe against the `canSubmit` on the element it gets
 *   back, so no route needs a record fixture shaped like its own table.
 *
 * ## Why the components are preloaded first
 *
 * `vite.config.ts` runs the router plugin with `autoCodeSplitting: true`, and
 * `vitest.config.ts` merges that config, so a suite gets the split build too.
 * Splitting rewrites `component: RouteComponent` into a lazy stand-in, and
 * rendering one suspends until its module arrives. Under vite-node that first
 * import is the route's whole dependency tree, forms and Mapbox included, which
 * is seconds rather than milliseconds. Left to the render it overran vitest's
 * five-second default and read as fourteen routes drawing no submit control.
 * So `beforeAll` calls each stand-in's `preload()` under a hook timeout that
 * fits, and every case then renders a component already in hand.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { type ReactElement, type ReactNode, Suspense } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AuthMe } from '../../../auth';
import { organizations } from '../../../lib/collections/organizations';
import { installMemoryCollections, seedRows } from '../lib/collections/memory-collections';

/**
 * The one piece of state the `vi.mock` factories read.
 *
 * `vi.hoisted` puts it above them, which is what lets a table row set the
 * snapshot for the render it is about without each factory closing over a
 * variable the hoisting would have moved out from under it.
 */
const harness = vi.hoisted(() => ({
	/** The route context a matched route would carry. Set per render. */
	context: { auth: { snapshot: null as unknown } } as unknown,
	/** `$id` for the six edit routes; empty for the eight create routes. */
	params: {} as unknown,
	/** No route under test reads a search key that changes the answer. */
	search: {} as unknown,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/react-router')>();
	return {
		...actual,
		createFileRoute: () => (options: Record<string, unknown>) => ({
			...options,
			options,
			useRouteContext: () => harness.context,
			useParams: () => harness.params,
			useSearch: () => harness.search,
		}),
		// No router is mounted, so the real one would throw looking for a match.
		// Nothing here submits, so nothing navigates.
		useNavigate: () => async () => undefined,
	};
});

/**
 * Every geometry read these routes make, answered.
 *
 * The three shapes (`useOwnedGeometry`, `useAddressGeometry`, and the inspection
 * edit's own `useQuery`) all sit on react-query and all gate a loader on
 * `isPending`. Answering the library once covers the three rather than mocking
 * three modules that say the same thing.
 */
vi.mock('@tanstack/react-query', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@tanstack/react-query')>();
	return {
		...actual,
		useQuery: () => ({ data: undefined, isPending: false, isLoading: false, isError: false }),
	};
});

/** What a route's form draws, reduced to the control this file is about. */
function SubmitProbe({ canSubmit }: { readonly canSubmit: boolean | undefined }) {
	return (
		<button data-testid="submit" disabled={canSubmit !== true} type="button">
			Submit
		</button>
	);
}

vi.mock('../../../routes/control-operations/biocontrol/-biocontrol-form', async (original) => ({
	...(await original<Record<string, unknown>>()),
	BiocontrolFormPage: SubmitProbe,
}));
vi.mock('../../../routes/control-operations/chemical/-application-form', async (original) => ({
	...(await original<Record<string, unknown>>()),
	ApplicationFormPage: SubmitProbe,
}));
vi.mock(
	'../../../routes/control-operations/source-reduction/-source-reduction-form',
	async (original) => ({
		...(await original<Record<string, unknown>>()),
		SourceReductionFormPage: SubmitProbe,
	}),
);
vi.mock('../../../routes/gis/addresses/-address-form', async (original) => ({
	...(await original<Record<string, unknown>>()),
	AddressFormPage: SubmitProbe,
}));
vi.mock('../../../routes/larval-surveillance/inspections/-inspection-form', async (original) => ({
	...(await original<Record<string, unknown>>()),
	InspectionFormPage: SubmitProbe,
}));
vi.mock('../../../routes/operations/missions/-mission-form', async (original) => ({
	...(await original<Record<string, unknown>>()),
	MissionFormPage: SubmitProbe,
}));
vi.mock('../../../routes/operations/requests-for-control/-request-form', async (original) => ({
	...(await original<Record<string, unknown>>()),
	RequestFormPage: SubmitProbe,
}));
vi.mock('../../../routes/public-engagement/outreach/-outreach-form', async (original) => ({
	...(await original<Record<string, unknown>>()),
	OutreachFormPage: SubmitProbe,
}));

vi.mock('../../../components/record', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	RecordEditFrame: ({ children }: { readonly children: (record: unknown) => ReactNode }) => {
		// The record is a bare id because no child function below reads a column
		// off it: each one passes it straight down to the loader it renders.
		const rendered = children({ id: 'record-1' }) as ReactElement<{
			canSubmit: boolean | undefined;
		}>;
		return <SubmitProbe canSubmit={rendered.props.canSubmit} />;
	},
}));

const ORGANIZATION_ID = 'organization-1';
const PROFILE_ID = 'profile-1';

/** A signed-in snapshot whose actor Profile is there, or is not. */
function snapshotWith(profileId: string | null): AuthMe {
	return {
		authenticated: true,
		user: {
			workosUserId: 'workos-user-1',
			email: 'field@example.test',
			firstName: 'Field',
			lastName: 'Lead',
			displayName: 'Field Lead',
			emailVerified: true,
			profilePictureUrl: null,
		},
		workosOrganizationId: 'workos-organization-1',
		localIdentity: {
			userId: 'user-1',
			organizationId: ORGANIZATION_ID,
			organizationName: 'Test Mosquito Control',
			organizationSlug: 'test-mosquito-control',
			profileId,
			membershipId: 'membership-1',
			role: 'admin',
		},
	};
}

/** The route modules, imported after the mocks above are in place. */
async function loadRoutes() {
	const [
		biocontrolCreate,
		biocontrolEdit,
		chemicalCreate,
		chemicalEdit,
		sourceReductionCreate,
		sourceReductionEdit,
		addressCreate,
		addressEdit,
		inspectionCreate,
		inspectionEdit,
		missionCreate,
		requestCreate,
		outreachCreate,
		outreachEdit,
	] = await Promise.all([
		import('../../../routes/control-operations/biocontrol/create'),
		import('../../../routes/control-operations/biocontrol/$id_.edit'),
		import('../../../routes/control-operations/chemical/create'),
		import('../../../routes/control-operations/chemical/$id_.edit'),
		import('../../../routes/control-operations/source-reduction/create'),
		import('../../../routes/control-operations/source-reduction/$id_.edit'),
		import('../../../routes/gis/addresses/create'),
		import('../../../routes/gis/addresses/$id_.edit'),
		import('../../../routes/larval-surveillance/inspections/create'),
		import('../../../routes/larval-surveillance/inspections/$id_.edit'),
		import('../../../routes/operations/missions/create'),
		import('../../../routes/operations/requests-for-control/create'),
		import('../../../routes/public-engagement/outreach/create'),
		import('../../../routes/public-engagement/outreach/$id_.edit'),
	]);
	return {
		biocontrolCreate,
		biocontrolEdit,
		chemicalCreate,
		chemicalEdit,
		sourceReductionCreate,
		sourceReductionEdit,
		addressCreate,
		addressEdit,
		inspectionCreate,
		inspectionEdit,
		missionCreate,
		requestCreate,
		outreachCreate,
		outreachEdit,
	};
}

/**
 * The lazy stand-in the router plugin leaves behind in `component`, or the
 * component itself when nothing split it.
 */
type SplitComponent = (() => ReactNode) & { readonly preload?: () => Promise<unknown> };

type RouteModule = { readonly Route: { readonly options: { readonly component?: unknown } } };

/** A route's component, loaded, which no route module exports by name. */
async function componentOf(module: RouteModule): Promise<() => ReactNode> {
	const component = module.Route.options.component as SplitComponent | undefined;
	if (typeof component !== 'function') {
		throw new Error('This route declares no component.');
	}
	await component.preload?.();
	return component;
}

/** Whether the route's submit control is live under this snapshot. */
async function submitEnabledUnder(
	Component: () => ReactNode,
	profileId: string | null,
	params: Record<string, string>,
): Promise<boolean> {
	harness.context = { auth: { snapshot: snapshotWith(profileId) } };
	harness.params = params;
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<Suspense fallback={<span>loading</span>}>
				<Component />
			</Suspense>
		</QueryClientProvider>,
	);
	await waitFor(() => {
		expect(screen.getByTestId('submit')).toBeDefined();
	});
	return !screen.getByTestId('submit').hasAttribute('disabled');
}

/** Which route module a row is about, and what a match would hand its component. */
interface WriteSurface {
	/** The path the route is reached at, so a reader can find the module. */
	readonly path: string;
	/** How {@link loadRoutes} holds the module. */
	readonly key: keyof Awaited<ReturnType<typeof loadRoutes>>;
	/** `$id` for the six edit routes, empty for the eight create routes. */
	readonly params: Record<string, string>;
}

/**
 * Every route site, as the list.
 *
 * Fourteen rows, and the list is the coverage: a fifteenth route computing its
 * own attribution belongs here rather than in a case of its own.
 */
const WRITE_SURFACES = [
	{ path: '/control-operations/biocontrol/create', key: 'biocontrolCreate', params: {} },
	{
		path: '/control-operations/biocontrol/$id/edit',
		key: 'biocontrolEdit',
		params: { id: 'record-1' },
	},
	{ path: '/control-operations/chemical/create', key: 'chemicalCreate', params: {} },
	{
		path: '/control-operations/chemical/$id/edit',
		key: 'chemicalEdit',
		params: { id: 'record-1' },
	},
	{ path: '/control-operations/source-reduction/create', key: 'sourceReductionCreate', params: {} },
	{
		path: '/control-operations/source-reduction/$id/edit',
		key: 'sourceReductionEdit',
		params: { id: 'record-1' },
	},
	{ path: '/gis/addresses/create', key: 'addressCreate', params: {} },
	{ path: '/gis/addresses/$id/edit', key: 'addressEdit', params: { id: 'record-1' } },
	{ path: '/larval-surveillance/inspections/create', key: 'inspectionCreate', params: {} },
	{
		path: '/larval-surveillance/inspections/$id/edit',
		key: 'inspectionEdit',
		params: { id: 'record-1' },
	},
	{ path: '/operations/missions/create', key: 'missionCreate', params: {} },
	{ path: '/operations/requests-for-control/create', key: 'requestCreate', params: {} },
	{ path: '/public-engagement/outreach/create', key: 'outreachCreate', params: {} },
	{
		path: '/public-engagement/outreach/$id/edit',
		key: 'outreachEdit',
		params: { id: 'record-1' },
	},
] as const satisfies readonly WriteSurface[];

describe('a write surface reads the actor Profile off the snapshot', () => {
	let components: Record<(typeof WRITE_SURFACES)[number]['key'], () => ReactNode>;

	beforeAll(async () => {
		installMemoryCollections();
		seedRows(organizations, [{ id: ORGANIZATION_ID, name: 'Test Mosquito Control', settings: {} }]);
		const routes = await loadRoutes();
		const loaded: Partial<Record<(typeof WRITE_SURFACES)[number]['key'], () => ReactNode>> = {};
		for (const surface of WRITE_SURFACES) {
			loaded[surface.key] = await componentOf(routes[surface.key]);
		}
		components = loaded as Record<(typeof WRITE_SURFACES)[number]['key'], () => ReactNode>;
	}, 300_000);

	afterEach(cleanup);

	/** Fourteen sites, the number #888 left reading the predicate at a route. */
	it('covers every route that computes its own write attribution', () => {
		expect(WRITE_SURFACES).toHaveLength(14);
	});

	for (const surface of WRITE_SURFACES) {
		it(`${surface.path} cannot be submitted with no actor Profile`, async () => {
			const enabled = await submitEnabledUnder(components[surface.key], null, surface.params);
			expect(enabled).toBe(false);
		});

		it(`${surface.path} can be submitted once the actor Profile is there`, async () => {
			const enabled = await submitEnabledUnder(components[surface.key], PROFILE_ID, surface.params);
			expect(enabled).toBe(true);
		});
	}
});

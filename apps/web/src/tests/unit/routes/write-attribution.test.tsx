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
 * table, so a further site is one row.
 *
 * #944 added the eight of `WRITE_SURFACE_FLOORS`' forty surfaces that named no
 * `canSubmit` and could be asserted: the two cleanup pages and the habitat
 * merge, whose commit is the action in `MergeConfirmDialog`; the weather import
 * and the mission add-stop, which are form pages the route now hands the prop
 * to; and the three live editors, which have no submit at all and gate every
 * control that writes. The ninth, the regions import, reads the same predicate
 * as `mutations.canWrite` under its own two conditions and is not a row, since
 * its button is disabled until a file has been parsed and no fixture here can
 * hand it one, so a case over it could only ever assert the direction that a
 * hardcoded `false` also passes.
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
 * The mocks below exist to get twenty-two components to render in jsdom, not to
 * supply the answer. Four of them are worth the note:
 *
 * - `createFileRoute` is replaced so a route module's `Route` hands back the
 *   context, params and search a match would. Rendering these through a real
 *   `RouterProvider` would run each route's `beforeLoad`, which is the role
 *   floor and a different question (`isBelowWriteFloor`, covered by
 *   `check:write-surfaces` and its own suites). It also means this file imports
 *   no route tree, which is the cost `link-destinations.test.tsx` is a single
 *   file to avoid paying twice. What it does pay is twenty-two route modules,
 *   and that is the same argument: one file, twenty-two rows.
 * - The form-page modules keep every export but their page component, which
 *   becomes {@link SubmitProbe}. The real ones draw a Mapbox canvas, and what
 *   this file reads is the prop they are handed. The three merge surfaces and
 *   the weather import are the same shape one level up, a route handing
 *   `canSubmit` to `RecordCleanup`, `HabitatMerge` or `ImportWeatherPage`.
 * - `RecordEditFrame` is replaced for the edit routes, whose `canSubmit` is
 *   computed in the outer component and handed to a loader the frame renders
 *   only once the record is in hand. The stand-in calls the frame's child
 *   function and draws the probe against the `canSubmit` on the element it gets
 *   back, so no route needs a record fixture shaped like its own table. A live
 *   editor hands the frame no such element, since it has no form to hand the
 *   prop to: its child is the editor itself, and the stand-in renders that
 *   instead, so the row names a control the editor draws and the case reads the
 *   `disabled` off it. Two of the three need a record row, because the
 *   assignment editor draws its fields only once the assignment is in hand, and
 *   `seedRows` puts one in the memory collection with the columns its read
 *   selects.
 * - The maps are stand-ins, `MapSplitPage` rendering its children and the two
 *   route maps rendering nothing, because a live editor's real body is what
 *   these rows render and Mapbox GL has no jsdom.
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
import { assignments } from '../../../lib/collections/assignments';
import { missions } from '../../../lib/collections/missions';
import { organizations } from '../../../lib/collections/organizations';
import { weather_sources } from '../../../lib/collections/weather_sources';
import { installMemoryCollections, seedRows } from '../lib/collections/memory-collections';
import { signedInSnapshot } from './route-mock-stand-ins';

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
	/** `$id` for the routes under a record; empty for the create routes. */
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
		// The live editors draw a back link and a link per stop. Where each goes is
		// `link-destinations.test.tsx`'s question, and a real `Link` throws here.
		Link: ({ children, ...rest }: { readonly children?: ReactNode }) => <a {...rest}>{children}</a>,
	};
});

/**
 * The same snapshot the route context carries, for what reads it off the store.
 *
 * The mutation hooks and the live editors read `useAuthSnapshot` rather than the
 * route context, and both answer the one question this file asks, so the mock
 * reads the harness. Two sources of the actor Profile would let a row pass on
 * one while the component read the other.
 */
vi.mock('../../../hooks/use-auth-snapshot', () => ({
	useAuthSnapshot: () => (harness.context as { auth: { snapshot: unknown } }).auth.snapshot,
}));

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

vi.mock('../../../components/control-operations/biocontrol/biocontrol-form', async (original) => ({
	...(await original<Record<string, unknown>>()),
	BiocontrolFormPage: SubmitProbe,
}));
vi.mock('../../../components/control-operations/chemical/application-form', async (original) => ({
	...(await original<Record<string, unknown>>()),
	ApplicationFormPage: SubmitProbe,
}));
vi.mock(
	'../../../components/control-operations/source-reduction/source-reduction-form',
	async (original) => ({
		...(await original<Record<string, unknown>>()),
		SourceReductionFormPage: SubmitProbe,
	}),
);
vi.mock('../../../components/gis/addresses/address-form', async (original) => ({
	...(await original<Record<string, unknown>>()),
	AddressFormPage: SubmitProbe,
}));
vi.mock(
	'../../../components/larval-surveillance/inspections/inspection-form',
	async (original) => ({
		...(await original<Record<string, unknown>>()),
		InspectionFormPage: SubmitProbe,
	}),
);
vi.mock('../../../components/operations/missions/mission-form', async (original) => ({
	...(await original<Record<string, unknown>>()),
	MissionFormPage: SubmitProbe,
}));
vi.mock('../../../components/operations/requests-for-control/request-form', async (original) => ({
	...(await original<Record<string, unknown>>()),
	RequestFormPage: SubmitProbe,
}));
vi.mock('../../../components/public-engagement/outreach/outreach-form', async (original) => ({
	...(await original<Record<string, unknown>>()),
	OutreachFormPage: SubmitProbe,
}));
vi.mock('../../../components/gis/weather/import-page', async (original) => ({
	...(await original<Record<string, unknown>>()),
	ImportWeatherPage: SubmitProbe,
}));
vi.mock('../../../components/operations/missions/add-stop-form', async (original) => ({
	...(await original<Record<string, unknown>>()),
	AddMissionStopForm: SubmitProbe,
}));
vi.mock('../../../components/cleanup/record-cleanup', async (original) => ({
	...(await original<Record<string, unknown>>()),
	RecordCleanup: SubmitProbe,
}));
vi.mock('../../../components/cleanup/habitat-merge', async (original) => ({
	...(await original<Record<string, unknown>>()),
	HabitatMerge: SubmitProbe,
}));

vi.mock('../../../components/app-shell/outlet/map-split-page', () => ({
	MapSplitPage: ({ children }: { readonly children?: ReactNode }) => <>{children}</>,
}));
vi.mock('../../../components/route-planning', async (original) => ({
	...(await original<Record<string, unknown>>()),
	RouteMap: () => null,
}));
vi.mock('../../../components/operations/worklist-map', () => ({
	WorklistMap: () => null,
}));

vi.mock('../../../components/record', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	RecordEditFrame: ({ children }: { readonly children: (record: unknown) => ReactNode }) => {
		// The record is a bare id because no child function below reads a column
		// off it: each one passes it straight down to the loader it renders.
		const rendered = children({ id: RECORD_ID }) as ReactElement<{
			canSubmit?: boolean | undefined;
		}>;
		// A form route hands back a loader carrying the prop; a live editor hands
		// back its own body, which is what the row's control is read off.
		return typeof rendered.props.canSubmit === 'boolean' ? (
			<SubmitProbe canSubmit={rendered.props.canSubmit} />
		) : (
			rendered
		);
	},
}));

const ORGANIZATION_ID = 'organization-1';
const PROFILE_ID = 'profile-1';
const RECORD_ID = 'record-1';

/** A signed-in snapshot whose actor Profile is there, or is not. */
function snapshotWith(profileId: string | null): AuthMe {
	return signedInSnapshot(ORGANIZATION_ID, profileId);
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
		trapRouteEdit,
		addressCleanup,
		weatherImport,
		habitatMerge,
		habitatRouteEdit,
		assignmentEdit,
		missionAddStop,
		contactCleanup,
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
		import('../../../routes/adult-surveillance/traps/routes/$id_.edit'),
		import('../../../routes/gis/addresses/cleanup'),
		import('../../../routes/gis/weather/$id_.import'),
		import('../../../routes/larval-surveillance/habitats/$id_.merge'),
		import('../../../routes/larval-surveillance/habitats/routes/$id_.edit'),
		import('../../../routes/operations/assignments/$id_.edit'),
		import('../../../routes/operations/missions/$id_.add-stop'),
		import('../../../routes/public-engagement/contacts/cleanup'),
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
		trapRouteEdit,
		addressCleanup,
		weatherImport,
		habitatMerge,
		habitatRouteEdit,
		assignmentEdit,
		missionAddStop,
		contactCleanup,
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

/**
 * Which element a row reads `disabled` off.
 *
 * The probe for every route that hands `canSubmit` to a form. A live editor has
 * no form and no one submit, so its row names one of the controls that write,
 * by accessible label, and the case reads the real element.
 */
type SubmitControl = { readonly probe: true } | { readonly label: string };

const PROBE: SubmitControl = { probe: true };

/** Whether the route's submit control is live under this snapshot. */
async function submitEnabledUnder(
	Component: () => ReactNode,
	profileId: string | null,
	params: Record<string, string>,
	control: SubmitControl,
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
	const find = () =>
		'probe' in control ? screen.getByTestId('submit') : screen.getByLabelText(control.label);
	await waitFor(() => {
		expect(find()).toBeDefined();
	});
	return !find().hasAttribute('disabled');
}

/** Which route module a row is about, and what a match would hand its component. */
interface WriteSurface {
	/** The path the route is reached at, so a reader can find the module. */
	readonly path: string;
	/** How {@link loadRoutes} holds the module. */
	readonly key: keyof Awaited<ReturnType<typeof loadRoutes>>;
	/** `$id` for the routes under a record, empty for the create routes. */
	readonly params: Record<string, string>;
	/** The probe, or the label of a live editor's control. */
	readonly control: SubmitControl;
}

const UNDER_RECORD = { id: RECORD_ID };

/**
 * Every route site, as the list.
 *
 * Twenty-two rows, and the list is the coverage: a route computing its own
 * attribution belongs here rather than in a case of its own.
 */
const WRITE_SURFACES = [
	{
		path: '/control-operations/biocontrol/create',
		key: 'biocontrolCreate',
		params: {},
		control: PROBE,
	},
	{
		path: '/control-operations/biocontrol/$id/edit',
		key: 'biocontrolEdit',
		params: UNDER_RECORD,
		control: PROBE,
	},
	{
		path: '/control-operations/chemical/create',
		key: 'chemicalCreate',
		params: {},
		control: PROBE,
	},
	{
		path: '/control-operations/chemical/$id/edit',
		key: 'chemicalEdit',
		params: UNDER_RECORD,
		control: PROBE,
	},
	{
		path: '/control-operations/source-reduction/create',
		key: 'sourceReductionCreate',
		params: {},
		control: PROBE,
	},
	{
		path: '/control-operations/source-reduction/$id/edit',
		key: 'sourceReductionEdit',
		params: UNDER_RECORD,
		control: PROBE,
	},
	{ path: '/gis/addresses/create', key: 'addressCreate', params: {}, control: PROBE },
	{
		path: '/gis/addresses/$id/edit',
		key: 'addressEdit',
		params: UNDER_RECORD,
		control: PROBE,
	},
	{
		path: '/larval-surveillance/inspections/create',
		key: 'inspectionCreate',
		params: {},
		control: PROBE,
	},
	{
		path: '/larval-surveillance/inspections/$id/edit',
		key: 'inspectionEdit',
		params: UNDER_RECORD,
		control: PROBE,
	},
	{ path: '/operations/missions/create', key: 'missionCreate', params: {}, control: PROBE },
	{
		path: '/operations/requests-for-control/create',
		key: 'requestCreate',
		params: {},
		control: PROBE,
	},
	{
		path: '/public-engagement/outreach/create',
		key: 'outreachCreate',
		params: {},
		control: PROBE,
	},
	{
		path: '/public-engagement/outreach/$id/edit',
		key: 'outreachEdit',
		params: UNDER_RECORD,
		control: PROBE,
	},
	// The eight #944 added. A live editor's control is the rename, the field
	// that writes on blur, so it is on screen with no stops seeded.
	{
		path: '/adult-surveillance/traps/routes/$id/edit',
		key: 'trapRouteEdit',
		params: UNDER_RECORD,
		control: { label: 'Route name' },
	},
	{ path: '/gis/addresses/cleanup', key: 'addressCleanup', params: {}, control: PROBE },
	{
		path: '/gis/weather/$id/import',
		key: 'weatherImport',
		params: UNDER_RECORD,
		control: PROBE,
	},
	{
		path: '/larval-surveillance/habitats/$id/merge',
		key: 'habitatMerge',
		params: UNDER_RECORD,
		control: PROBE,
	},
	{
		path: '/larval-surveillance/habitats/routes/$id/edit',
		key: 'habitatRouteEdit',
		params: UNDER_RECORD,
		control: { label: 'Route name' },
	},
	{
		path: '/operations/assignments/$id/edit',
		key: 'assignmentEdit',
		params: UNDER_RECORD,
		control: { label: 'Name' },
	},
	{
		path: '/operations/missions/$id/add-stop',
		key: 'missionAddStop',
		params: UNDER_RECORD,
		control: PROBE,
	},
	{
		path: '/public-engagement/contacts/cleanup',
		key: 'contactCleanup',
		params: {},
		control: PROBE,
	},
] as const satisfies readonly WriteSurface[];

describe('a write surface reads the actor Profile off the snapshot', () => {
	let components: Record<(typeof WRITE_SURFACES)[number]['key'], () => ReactNode>;

	beforeAll(async () => {
		installMemoryCollections();
		seedRows(organizations, [{ id: ORGANIZATION_ID, name: 'Test Mosquito Control', settings: {} }]);
		// The three routes that draw nothing until their record is in hand. Each
		// row carries the columns its read selects and no more; the null
		// timestamps are what puts the plan in a state the page lets anyone edit.
		seedRows(assignments, [
			{
				id: RECORD_ID,
				organization_id: ORGANIZATION_ID,
				assignment_name: 'Tuesday route',
				assignment_date: '2026-09-15',
				assigned_to_profile_id: null,
				due_at: null,
				started_at: null,
				completed_at: null,
				cancelled_at: null,
				cancellation_reason: null,
			},
		]);
		seedRows(missions, [
			{
				id: RECORD_ID,
				organization_id: ORGANIZATION_ID,
				mission_name: 'Fog run',
				control_type: 'adulticide',
				planned_method_id: null,
				assigned_to_profile_id: null,
				assigned_by_profile_id: null,
				scheduled_start_at: null,
				scheduled_end_at: null,
				rain_date: null,
				started_at: null,
				completed_at: null,
				cancelled_at: null,
				cancellation_reason: null,
				notification_type_id: null,
				created_at: '2026-09-15T00:00:00Z',
				updated_at: '2026-09-15T00:00:00Z',
			},
		]);
		seedRows(weather_sources, [
			{
				id: RECORD_ID,
				organization_id: ORGANIZATION_ID,
				source_name: 'Yard station',
				source_type: 'station',
				source_code: null,
				provider_source_id: null,
				is_active: true,
				lat: null,
				lng: null,
				geom_type: null,
				metadata: {},
			},
		]);
		const routes = await loadRoutes();
		const loaded: Partial<Record<(typeof WRITE_SURFACES)[number]['key'], () => ReactNode>> = {};
		for (const surface of WRITE_SURFACES) {
			loaded[surface.key] = await componentOf(routes[surface.key]);
		}
		components = loaded as Record<(typeof WRITE_SURFACES)[number]['key'], () => ReactNode>;
	}, 300_000);

	afterEach(cleanup);

	/**
	 * Twenty-two sites: the fourteen #888 left reading the predicate at a route,
	 * and the eight of #944's nine that a case can assert in both directions.
	 */
	it('covers every route that computes its own write attribution', () => {
		expect(WRITE_SURFACES).toHaveLength(22);
	});

	for (const surface of WRITE_SURFACES) {
		it(`${surface.path} cannot be submitted with no actor Profile`, async () => {
			const enabled = await submitEnabledUnder(
				components[surface.key],
				null,
				surface.params,
				surface.control,
			);
			expect(enabled).toBe(false);
		});

		it(`${surface.path} can be submitted once the actor Profile is there`, async () => {
			const enabled = await submitEnabledUnder(
				components[surface.key],
				PROFILE_ID,
				surface.params,
				surface.control,
			);
			expect(enabled).toBe(true);
		});
	}
});

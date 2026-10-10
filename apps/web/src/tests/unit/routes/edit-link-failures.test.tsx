/** @vitest-environment jsdom */

/**
 * What five edit routes do when a link write fails after the record's own
 * update has landed.
 *
 * Collection, chemical application, biocontrol action, source reduction and
 * outreach action edit each reconcile the crew after the update, and chemical
 * application reconciles the insecticide batches too. A refusal there used to
 * reject the save, so the form showed `Unable to Save` and stayed put over a
 * record whose update had committed (#1603). Now each miss is a change toast
 * naming the record, and the route opens the record, which is what inspection
 * edit already did (`inspection-edit-link-failures.test.tsx`). A refused
 * update still rejects the save and goes nowhere, since nothing landed.
 *
 * The routes render whole over the memory collections, with the records from
 * `edit-record-fixtures.ts`. Collection has no fixture there, so its two read
 * hooks answer from this file. The mutation hooks are stubs answering from
 * `harness`, and each form is a probe that hands back the `onSave` and the
 * values it was given, since what this file asks is what the route does with a
 * save and not how the form draws.
 *
 * One file for five routes, for the reason `edit-loaders.test.tsx` gives: the
 * mocks and the preload are shared, and vitest isolates modules per file.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, render, screen } from '@testing-library/react';
import { type ReactNode, Suspense } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { additional_personnel } from '../../../lib/collections/additional_personnel';
import { application_methods } from '../../../lib/collections/application_methods';
import { applications } from '../../../lib/collections/applications';
import { biocontrol_actions } from '../../../lib/collections/biocontrol_actions';
import { biocontrol_methods } from '../../../lib/collections/biocontrol_methods';
import { equipment } from '../../../lib/collections/equipment';
import { insecticides } from '../../../lib/collections/insecticides';
import { organizations } from '../../../lib/collections/organizations';
import { outreach_actions } from '../../../lib/collections/outreach_actions';
import { outreach_methods } from '../../../lib/collections/outreach_methods';
import { profiles } from '../../../lib/collections/profiles';
import { source_reduction_methods } from '../../../lib/collections/source_reduction_methods';
import { source_reductions } from '../../../lib/collections/source_reductions';
import { units } from '../../../lib/collections/units';
import { vehicles } from '../../../lib/collections/vehicles';
import { installMemoryCollections, seedRows } from '../lib/collections/memory-collections';
import {
	ADDITIONAL_PERSONNEL,
	APPLICATION,
	APPLICATION_METHOD,
	BIOCONTROL_ACTION,
	BIOCONTROL_METHOD,
	EQUIPMENT,
	INSECTICIDE,
	ORGANIZATION,
	ORGANIZATION_ID,
	OUTREACH_ACTION,
	OUTREACH_METHOD,
	PROFILES,
	SOURCE_REDUCTION,
	SOURCE_REDUCTION_METHOD,
	TECHNICIAN_ID,
	UNITS,
	VEHICLE,
} from './edit-record-fixtures';
import { signedInSnapshot } from './route-mock-stand-ins';

const COLLECTION_ID = 'c011ec70-0000-4000-8000-000000000001';

const harness = vi.hoisted(() => ({
	context: { auth: { snapshot: null as unknown } } as unknown,
	params: {} as Record<string, string>,
	/** What the form probe was last handed. */
	form: null as { onSave: unknown; defaultValues: unknown } | null,
	navigate: (_to: unknown) => Promise.resolve(),
	toastError: (_title: string, _options: unknown) => undefined,
	/** The record's own update, which every route awaits first. */
	update: () => Promise.resolve(),
	setPersonnel: () => Promise.resolve(),
	setBatches: () => Promise.resolve(),
	/** The form probe every route's form page is swapped for. */
	probe: (props: { onSave: unknown; defaultValues: unknown }): ReactNode => {
		harness.form = props;
		return 'record form';
	},
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
			useSearch: () => ({}),
		}),
		useNavigate: () => (to: unknown) => harness.navigate(to),
		Link: ({ children, ...rest }: { readonly children?: ReactNode }) => <a {...rest}>{children}</a>,
	};
});

vi.mock('../../../hooks/use-auth-snapshot', () => ({
	useAuthSnapshot: () => (harness.context as { auth: { snapshot: unknown } }).auth.snapshot,
}));

vi.mock('sonner', () => ({
	toast: {
		error: (title: string, options: unknown) => harness.toastError(title, options),
		success: () => undefined,
	},
}));

vi.mock('../../../hooks/mutations/use-additional-personnel-mutations', () => ({
	useAdditionalPersonnelMutations: () => ({ setPersonnel: () => harness.setPersonnel() }),
}));
vi.mock('../../../hooks/mutations/use-application-mutations', () => ({
	useApplicationMutations: () => ({
		update: () => harness.update(),
		setBatches: () => harness.setBatches(),
	}),
}));
vi.mock('../../../hooks/mutations/use-biocontrol-action-mutations', () => ({
	useBiocontrolActionMutations: () => ({ update: () => harness.update() }),
}));
vi.mock('../../../hooks/mutations/use-source-reduction-mutations', () => ({
	useSourceReductionMutations: () => ({ update: () => harness.update() }),
}));
vi.mock('../../../hooks/mutations/use-outreach-action-mutations', () => ({
	useOutreachActionMutations: () => ({ update: () => harness.update() }),
}));
vi.mock('../../../hooks/mutations/use-collection-mutations', () => ({
	useCollectionMutations: () => ({ canWrite: true, save: () => harness.update() }),
}));

vi.mock('../../../hooks/use-owned-geometry', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../hooks/use-owned-geometry')>()),
	useOwnedGeometry: () => ({ geojson: null, isError: false, isPending: false }),
}));

vi.mock('../../../hooks/queries/use-collection-record', () => ({
	useCollectionRecord: () => ({
		collection: {
			id: COLLECTION_ID,
			trapId: 'c011ec70-0000-4000-8000-0000000000a1',
			addressId: null,
			collectionMethodId: 'c011ec70-0000-4000-8000-0000000000b1',
			collectionLureId: null,
			collectionTimingMode: 'exact_timestamps',
			startedAt: null,
			collectedAt: null,
			collectionDate: null,
			durationAmount: null,
			durationUnitId: null,
			setByProfileId: null,
			collectedByProfileId: null,
			hasProblem: false,
			metadata: null,
			latitude: 38.58,
			longitude: -121.49,
		},
		isReady: true,
		isError: false,
	}),
}));
vi.mock('../../../hooks/queries/use-trap-options', () => ({
	useTrapOptions: () => ({ traps: [], isReady: true }),
}));

vi.mock(
	'../../../components/adult-surveillance/collections/collection-form',
	async (importOriginal) => ({
		...(await importOriginal<Record<string, unknown>>()),
		CollectionFormPage: harness.probe,
	}),
);
vi.mock(
	'../../../components/control-operations/chemical/application-form',
	async (importOriginal) => ({
		...(await importOriginal<Record<string, unknown>>()),
		ApplicationFormPage: harness.probe,
	}),
);
vi.mock(
	'../../../components/control-operations/biocontrol/biocontrol-form',
	async (importOriginal) => ({
		...(await importOriginal<Record<string, unknown>>()),
		BiocontrolFormPage: harness.probe,
	}),
);
vi.mock(
	'../../../components/control-operations/source-reduction/source-reduction-form',
	async (importOriginal) => ({
		...(await importOriginal<Record<string, unknown>>()),
		SourceReductionFormPage: harness.probe,
	}),
);
vi.mock('../../../components/public-engagement/outreach/outreach-form', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	OutreachFormPage: harness.probe,
}));

/** The route modules, imported after the mocks above are in place. */
async function loadRoutes() {
	const [collection, chemical, biocontrol, sourceReduction, outreach] = await Promise.all([
		import('../../../routes/adult-surveillance/collections/$id_.edit'),
		import('../../../routes/control-operations/chemical/$id_.edit'),
		import('../../../routes/control-operations/biocontrol/$id_.edit'),
		import('../../../routes/control-operations/source-reduction/$id_.edit'),
		import('../../../routes/public-engagement/outreach/$id_.edit'),
	]);
	return { collection, chemical, biocontrol, sourceReduction, outreach };
}

type RouteKey = keyof Awaited<ReturnType<typeof loadRoutes>>;

type SplitComponent = (() => ReactNode) & { readonly preload?: () => Promise<unknown> };

type RouteModule = { readonly Route: { readonly options: { readonly component?: unknown } } };

/** A route's component, loaded, for the reason `edit-loaders.test.tsx` gives. */
async function componentOf(module: RouteModule): Promise<() => ReactNode> {
	const component = module.Route.options.component as SplitComponent | undefined;
	if (typeof component !== 'function') {
		throw new Error('This route declares no component.');
	}
	await component.preload?.();
	return component;
}

/** One route, the record it opens, the noun the toast names and where it lands. */
interface EditSurface {
	readonly key: RouteKey;
	readonly recordId: string;
	readonly noun: string;
	readonly page: { readonly to: string; readonly params: { readonly id: string } };
}

const EDIT_SURFACES: readonly EditSurface[] = [
	{
		key: 'collection',
		recordId: COLLECTION_ID,
		noun: 'collection',
		page: { to: '/adult-surveillance/collections/$id', params: { id: COLLECTION_ID } },
	},
	{
		key: 'chemical',
		recordId: APPLICATION.id,
		noun: 'chemical application',
		page: { to: '/control-operations/chemical/$id', params: { id: APPLICATION.id } },
	},
	{
		key: 'biocontrol',
		recordId: BIOCONTROL_ACTION.id,
		noun: 'biocontrol action',
		page: { to: '/control-operations/biocontrol/$id', params: { id: BIOCONTROL_ACTION.id } },
	},
	{
		key: 'sourceReduction',
		recordId: SOURCE_REDUCTION.id,
		noun: 'source reduction',
		page: {
			to: '/control-operations/source-reduction/$id',
			params: { id: SOURCE_REDUCTION.id },
		},
	},
	{
		key: 'outreach',
		recordId: OUTREACH_ACTION.id,
		noun: 'outreach action',
		page: { to: '/public-engagement/outreach/$id', params: { id: OUTREACH_ACTION.id } },
	},
];

const CREW_TITLE = 'Saved, but the additional personnel could not be updated.';
const BATCHES_TITLE = 'Saved, but the insecticide batches could not be updated.';

const toastError = vi.fn();
const navigate = vi.fn((_to: unknown) => Promise.resolve());
const setPersonnel = vi.fn(() => Promise.resolve());
const setBatches = vi.fn(() => Promise.resolve());
const update = vi.fn(() => Promise.resolve());

let components: Record<RouteKey, () => ReactNode>;

beforeAll(async () => {
	installMemoryCollections();
	seedRows(organizations, [ORGANIZATION]);
	seedRows(profiles, PROFILES);
	seedRows(units, UNITS);
	seedRows(additional_personnel, ADDITIONAL_PERSONNEL);
	seedRows(biocontrol_methods, [BIOCONTROL_METHOD]);
	seedRows(biocontrol_actions, [BIOCONTROL_ACTION]);
	seedRows(insecticides, [INSECTICIDE]);
	seedRows(application_methods, [APPLICATION_METHOD]);
	seedRows(vehicles, [VEHICLE]);
	seedRows(equipment, [EQUIPMENT]);
	seedRows(applications, [APPLICATION]);
	seedRows(source_reduction_methods, [SOURCE_REDUCTION_METHOD]);
	seedRows(source_reductions, [SOURCE_REDUCTION]);
	seedRows(outreach_methods, [OUTREACH_METHOD]);
	seedRows(outreach_actions, [OUTREACH_ACTION]);
	const routes = await loadRoutes();
	const loaded: Partial<Record<RouteKey, () => ReactNode>> = {};
	for (const surface of EDIT_SURFACES) {
		loaded[surface.key] = await componentOf(routes[surface.key]);
	}
	components = loaded as Record<RouteKey, () => ReactNode>;
}, 300_000);

beforeEach(() => {
	harness.context = { auth: { snapshot: signedInSnapshot(ORGANIZATION_ID, TECHNICIAN_ID) } };
	harness.form = null;
	for (const stub of [toastError, navigate, setPersonnel, setBatches, update]) {
		stub.mockReset();
	}
	for (const stub of [navigate, setPersonnel, setBatches, update]) {
		stub.mockImplementation(() => Promise.resolve());
	}
	harness.toastError = toastError;
	harness.navigate = navigate;
	harness.setPersonnel = setPersonnel;
	harness.setBatches = setBatches;
	harness.update = update;
});

afterEach(cleanup);

type OnSave = (input: {
	readonly values: unknown;
	readonly geometry: null;
	readonly geometryChanged: boolean;
}) => Promise<void>;

/** Render the route, wait for the form probe, and save it on its own values. */
async function save(surface: EditSurface): Promise<void> {
	harness.params = { id: surface.recordId };
	const Component = components[surface.key];
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<Suspense fallback={<span>loading</span>}>
				<Component />
			</Suspense>
		</QueryClientProvider>,
	);
	await screen.findByText('record form');
	const form = harness.form as { onSave: OnSave; defaultValues: unknown };
	await act(() =>
		form.onSave({ values: form.defaultValues, geometry: null, geometryChanged: false }),
	);
}

describe.each(EDIT_SURFACES)('$key edit, when a link write fails after the update', (surface) => {
	it('reports a refused crew write as a change to retry from the edit form', async () => {
		setPersonnel.mockImplementation(() => Promise.reject(new Error('Refused.')));
		await save(surface);
		expect(toastError).toHaveBeenCalledTimes(1);
		expect(toastError).toHaveBeenCalledWith(CREW_TITLE, {
			description: `Refused. Edit the ${surface.noun} to try again.`,
		});
	});

	it('still opens the record after a refused crew write', async () => {
		setPersonnel.mockImplementation(() => Promise.reject(new Error('Refused.')));
		await save(surface);
		expect(navigate).toHaveBeenCalledWith(surface.page);
	});

	it('fails the save and stays on the form when the update itself is refused', async () => {
		update.mockImplementation(() => Promise.reject(new Error('Update refused.')));
		await expect(save(surface)).rejects.toThrow('Update refused.');
		expect(setPersonnel).not.toHaveBeenCalled();
		expect(toastError).not.toHaveBeenCalled();
		expect(navigate).not.toHaveBeenCalled();
	});
});

describe('chemical application edit, when the batch write fails after the update', () => {
	const chemical = EDIT_SURFACES.find((surface) => surface.key === 'chemical') as EditSurface;

	it('reports a refused batch write and still opens the record', async () => {
		setBatches.mockImplementation(() => Promise.reject(new Error('Refused.')));
		await save(chemical);
		expect(toastError).toHaveBeenCalledTimes(1);
		expect(toastError).toHaveBeenCalledWith(BATCHES_TITLE, {
			description: 'Refused. Edit the chemical application to try again.',
		});
		expect(navigate).toHaveBeenCalledWith(chemical.page);
	});

	it('reports the crew and the batches apart when both are refused', async () => {
		setPersonnel.mockImplementation(() => Promise.reject(new Error('Refused.')));
		setBatches.mockImplementation(() => Promise.reject(new Error('Refused.')));
		await save(chemical);
		expect(toastError).toHaveBeenCalledTimes(2);
		expect(toastError.mock.calls.map(([title]) => title).sort()).toEqual(
			[CREW_TITLE, BATCHES_TITLE].sort(),
		);
		expect(navigate).toHaveBeenCalledWith(chemical.page);
	});
});

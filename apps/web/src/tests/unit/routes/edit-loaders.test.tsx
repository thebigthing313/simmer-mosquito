/** @vitest-environment jsdom */

/**
 * The six edit routes whose inner loader opens the form on the record's values.
 *
 * Each of these routes is two components: an outer one that reads the record
 * and computes `canSubmit`, and an `Edit*Loader` the frame renders once the
 * record is in hand, which reads the geometry and the crew, maps the row onto
 * the form's values through a `defaultsFrom*` function, and draws the form.
 * `write-attribution.test.tsx` covers the outer half by calling the frame's
 * child function and reading `canSubmit` off the element it returns, and never
 * renders that element, so the loaders and their `defaultsFrom*` functions were
 * rendered by nothing (#945). A `defaultsFrom*` that mapped the technician onto
 * the wrong field, or dropped a column, failed no gate: `tsc` holds the shape
 * of the values, not which column fills which.
 *
 * So each row here renders the route whole, with its record in the memory
 * collection, and asserts the form's fields show the record. The loaders are
 * not exported and the routes are the only way to them, which is also the
 * honest one: the read hook, the frame and the `defaultsFrom*` function are all
 * on the path from the row to the field.
 *
 * ## What is faked
 *
 * - The router, as `write-attribution.test.tsx` fakes it: `createFileRoute`
 *   hands back the context and the `$id` a match would, and a real
 *   `RouterProvider` would run `beforeLoad`, which is the role floor and
 *   `check:write-surfaces`' question.
 * - `sessionFetch`, so the geometry endpoints each loader reads answer a point.
 *   That is the one server read on the path; everything else is a collection,
 *   and the collections are the real TanStack DB engine over rows in memory, so
 *   the joins that turn a `technician_profile_id` into `Ana Rivera` run.
 * - `MapCanvas`, which the forms draw beside their fields and Mapbox GL has no
 *   jsdom for. It renders a paragraph and never reports a map ready, so the
 *   draw controller holds no map and nothing here asserts geometry.
 *
 * The record fixtures are `edit-record-fixtures.ts`, typed against the
 * generated row schemas, and the components are preloaded in `beforeAll` for
 * the reason the write-attribution suite's docblock gives: the split build
 * hands back a lazy stand-in whose first render pulls the route's whole tree.
 *
 * One file for six routes rather than six under the mirror path, for the
 * reason `link-destinations.test.tsx` is one file: the mocks and the preload
 * are the same for all six, and vitest isolates modules per file, so six files
 * would pay the route imports six times.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { type ReactNode, Suspense } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { additional_personnel } from '../../../lib/collections/additional_personnel';
import { addresses } from '../../../lib/collections/addresses';
import { application_methods } from '../../../lib/collections/application_methods';
import { applications } from '../../../lib/collections/applications';
import { biocontrol_actions } from '../../../lib/collections/biocontrol_actions';
import { biocontrol_methods } from '../../../lib/collections/biocontrol_methods';
import { equipment } from '../../../lib/collections/equipment';
import { habitat_types } from '../../../lib/collections/habitat_types';
import { insecticides } from '../../../lib/collections/insecticides';
import { inspections } from '../../../lib/collections/inspections';
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
	ADDRESS,
	APPLICATION,
	APPLICATION_METHOD,
	BIOCONTROL_ACTION,
	BIOCONTROL_METHOD,
	EQUIPMENT,
	HABITAT_TYPE,
	INSECTICIDE,
	INSPECTION,
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

const harness = vi.hoisted(() => ({
	/** The route context a matched route would carry. */
	context: { auth: { snapshot: null as unknown } } as unknown,
	/** `$id`, set per row. */
	params: {} as Record<string, string>,
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
		useNavigate: () => async () => undefined,
		Link: ({ children, ...rest }: { readonly children?: ReactNode }) => <a {...rest}>{children}</a>,
	};
});

vi.mock('../../../hooks/use-auth-snapshot', () => ({
	useAuthSnapshot: () => (harness.context as { auth: { snapshot: unknown } }).auth.snapshot,
}));

/**
 * The geometry endpoints, answering a point under whichever key the caller
 * nests its row: `/map/biocontrol/:id` reads `body.biocontrolAction`,
 * `/map/addresses/:id` reads `body.address`, and so on. Every key gets the same
 * row, so no reader finds its key missing and reads the record as unplaced.
 */
vi.mock('@simmer-mosquito/sync', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@simmer-mosquito/sync')>();
	const point = {
		geojson: { type: 'Point', coordinates: [-121.49, 38.58] },
		geomType: 'st_point',
		lat: 38.58,
		lng: -121.49,
	};
	const body = Object.fromEntries(
		[
			'biocontrolAction',
			'application',
			'sourceReduction',
			'outreachAction',
			'address',
			'inspection',
		].map((key) => [key, point]),
	);
	return {
		...actual,
		sessionFetch: () =>
			Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response),
	};
});

vi.mock('../../../components/map', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../components/map')>()),
	MapCanvas: () => <p>map surface</p>,
}));

/** The route modules, imported after the mocks above are in place. */
async function loadRoutes() {
	const [biocontrol, chemical, sourceReduction, address, inspection, outreach] = await Promise.all([
		import('../../../routes/control-operations/biocontrol/$id_.edit'),
		import('../../../routes/control-operations/chemical/$id_.edit'),
		import('../../../routes/control-operations/source-reduction/$id_.edit'),
		import('../../../routes/gis/addresses/$id_.edit'),
		import('../../../routes/larval-surveillance/inspections/$id_.edit'),
		import('../../../routes/public-engagement/outreach/$id_.edit'),
	]);
	return { biocontrol, chemical, sourceReduction, address, inspection, outreach };
}

type RouteKey = keyof Awaited<ReturnType<typeof loadRoutes>>;

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
 * How a field shows its value, which is what a case reads.
 *
 * A text control is an input or a textarea and the value is its `value`. A
 * select is a Radix trigger and the value is the chosen option's label as the
 * trigger's text. A date is the picker's trigger, which writes the day out in
 * `MMM d, yyyy`. All three are found by their label.
 */
type FieldReading =
	| { readonly label: string; readonly value: string }
	| { readonly label: string; readonly text: string };

/** One route, the fixture it opens, and the fields the form has to show. */
interface EditSurface {
	readonly path: string;
	readonly key: RouteKey;
	readonly recordId: string;
	readonly fields: readonly FieldReading[];
}

const EDIT_SURFACES = [
	{
		path: '/control-operations/biocontrol/$id/edit',
		key: 'biocontrol',
		recordId: BIOCONTROL_ACTION.id,
		fields: [
			{ label: 'Release date', text: 'Jun 2, 2026' },
			{ label: 'Technician', text: 'Ana Rivera' },
			{ label: 'Biocontrol method', text: 'Gambusia stocking' },
			{ label: 'Amount released', value: '250' },
			{ label: 'Unit', text: 'Each (ea)' },
		],
	},
	{
		path: '/control-operations/chemical/$id/edit',
		key: 'chemical',
		recordId: APPLICATION.id,
		fields: [
			{ label: 'Application date', text: 'Jun 3, 2026' },
			{ label: 'Applicator', value: 'Ana Rivera' },
			{ label: 'Insecticide', value: 'VectoBac 12AS' },
			{ label: 'Amount applied', value: '12.5' },
			{ label: 'Unit', text: 'Gallon (gal)' },
			{ label: 'Application method', text: 'Backpack sprayer' },
			{ label: 'Vehicle', text: 'Truck 7' },
			{ label: 'Equipment', text: 'Stihl SR 450' },
		],
	},
	{
		path: '/control-operations/source-reduction/$id/edit',
		key: 'sourceReduction',
		recordId: SOURCE_REDUCTION.id,
		fields: [
			{ label: 'Date performed', text: 'Jun 4, 2026' },
			// The fixture names nobody, which is the sentinel branch of the mapping.
			{ label: 'Technician', text: 'Unassigned' },
			{ label: 'Method', text: 'Tire removal' },
			{ label: 'Sources eliminated', value: '7' },
			{ label: 'Unit', text: 'Each (ea)' },
		],
	},
	{
		path: '/gis/addresses/$id/edit',
		key: 'address',
		recordId: ADDRESS.id,
		fields: [
			{ label: 'Display name', value: '1 11th Street' },
			{ label: 'Country', value: 'US' },
			{ label: 'Street address', value: '1 11th Street' },
			{ label: 'Unit', value: 'Suite 4' },
			{ label: 'City', value: 'Sacramento' },
			{ label: 'State', value: 'CA' },
			{ label: 'Postal code', value: '95814' },
		],
	},
	{
		path: '/larval-surveillance/inspections/$id/edit',
		key: 'inspection',
		recordId: INSPECTION.id,
		fields: [
			{ label: 'Inspection date', text: 'Jun 5, 2026' },
			{ label: 'Inspector', value: 'Ana Rivera' },
			{ label: 'Habitat type', value: 'Roadside ditch' },
			{ label: 'Density', text: 'Medium' },
			{ label: 'Dips', value: '10' },
			{ label: 'Larvae counted', value: '42' },
		],
	},
	{
		path: '/public-engagement/outreach/$id/edit',
		key: 'outreach',
		recordId: OUTREACH_ACTION.id,
		fields: [
			{ label: 'Outreach date', text: 'Jun 6, 2026' },
			{ label: 'Technician', text: 'Ana Rivera' },
			{ label: 'Outreach method', text: 'Door hangers' },
			{ label: 'People reached', value: '120' },
			{ label: 'Who was reached', value: 'Every house on Elm Court' },
		],
	},
] as const satisfies readonly EditSurface[];

/** Every row the six records and their forms read, in the memory collections. */
function seedFixtures(): void {
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
	seedRows(addresses, [ADDRESS]);
	seedRows(habitat_types, [HABITAT_TYPE]);
	seedRows(inspections, [INSPECTION]);
	seedRows(outreach_methods, [OUTREACH_METHOD]);
	seedRows(outreach_actions, [OUTREACH_ACTION]);
}

function renderEdit(Component: () => ReactNode, recordId: string) {
	harness.context = { auth: { snapshot: signedInSnapshot(ORGANIZATION_ID, TECHNICIAN_ID) } };
	harness.params = { id: recordId };
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<Suspense fallback={<span>loading</span>}>
				<Component />
			</Suspense>
		</QueryClientProvider>,
	);
}

/**
 * The label as written, with the required mark a required field's label
 * carries after it taken off, so a row names the field and not its rule.
 */
function labelled(label: string) {
	return (content: string) => content.replace(/\*$/u, '').trim() === label;
}

/** What the labelled control shows, as {@link FieldReading} reads it. */
function shown(reading: FieldReading): string {
	const control = screen.getByLabelText(labelled(reading.label));
	return 'value' in reading
		? (control as HTMLInputElement | HTMLTextAreaElement).value
		: (control.textContent ?? '');
}

describe('an edit loader opens the form on the record', () => {
	let components: Record<RouteKey, () => ReactNode>;

	beforeAll(async () => {
		seedFixtures();
		const routes = await loadRoutes();
		const loaded: Partial<Record<RouteKey, () => ReactNode>> = {};
		for (const surface of EDIT_SURFACES) {
			loaded[surface.key] = await componentOf(routes[surface.key]);
		}
		components = loaded as Record<RouteKey, () => ReactNode>;
	}, 300_000);

	afterEach(cleanup);

	it('covers the six routes whose loader maps a record onto a form', () => {
		expect(EDIT_SURFACES).toHaveLength(6);
		for (const surface of EDIT_SURFACES) {
			expect(surface.fields.length, surface.path).toBeGreaterThanOrEqual(3);
		}
	});

	for (const surface of EDIT_SURFACES) {
		it(`${surface.path} shows the record's values in its fields`, async () => {
			renderEdit(components[surface.key], surface.recordId);
			const [first, ...rest] = surface.fields;
			// The form arrives once the record, the geometry and the crew are all
			// in hand, so wait for the first field and read the rest off the same
			// render.
			await screen.findByLabelText(labelled(first.label));
			expect(shown(first), first.label).toBe('value' in first ? first.value : first.text);
			for (const field of rest) {
				expect(shown(field), field.label).toBe('value' in field ? field.value : field.text);
			}
		});
	}

	it('lists the crew the record names beside the technician', async () => {
		renderEdit(components.biocontrol, BIOCONTROL_ACTION.id);
		await screen.findByLabelText(labelled('Technician'));
		// The name is on the chip and on the option behind it, so more than once.
		expect(screen.getAllByText('Ben Okafor').length).toBeGreaterThan(0);
	});
});

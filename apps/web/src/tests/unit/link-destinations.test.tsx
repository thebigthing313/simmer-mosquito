/** @vitest-environment jsdom */

/**
 * Where the links this app renders actually go.
 *
 * One file rather than a case beside each component, and not named for a module
 * it covers: it imports the generated route tree, which pulls in every route
 * module, and vitest isolates modules per file. Split across two suites that
 * cost is paid twice. `router-harness.tsx` beside this says why the real tree is
 * what it builds a router over.
 *
 * The three destinations here are the ones #582 found shipped untested: a People
 * row action (#483), the Profile display name beside it (#541), and the five
 * habitat history rows (#568). All three are well formed, so `tsc` passed them.
 * What none of them had was anything asserting which id went into the path.
 *
 * Every fixture below gives a row's own id and each foreign id it carries a
 * different value, so a `params` reading the neighbouring field resolves to a
 * different href and fails here.
 */

import { TooltipProvider } from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityEntry } from '../../components/activity/activity-data';
import { ActivityLog } from '../../components/activity/activity-log';
import type { DashboardResponse } from '../../components/dashboard/dashboard-data';
import { DashboardPage } from '../../components/dashboard/dashboard-page';
import { HabitatHistoryCard } from '../../components/larval-surveillance/habitats/habitat-history-card';
import { HabitatSurfaceSwitch } from '../../components/larval-surveillance/habitats/habitat-surface-switch';
import { sharedHabitatSearch } from '../../components/larval-surveillance/habitats/habitats-search';
import { InspectionSurfaceSwitch } from '../../components/larval-surveillance/inspection-surface-switch';
import { sharedInspectionSearch } from '../../components/larval-surveillance/inspections-search';
import { SampleSurfaceSwitch } from '../../components/larval-surveillance/samples/sample-surface-switch';
import { sharedSampleSearch } from '../../components/larval-surveillance/samples-search';
import { PeopleSection } from '../../components/my-organization/people';
import { OverviewTable } from '../../components/overview/overview-table';
import { UpwardLine } from '../../components/overview/overview-upward-line';
import { ServiceRequestDetailHeader } from '../../components/public-engagement/service-requests/service-request-detail-header';
import type {
	NearbyCategory,
	NearbyItem,
} from '../../components/public-engagement/service-requests/service-request-nearby';
import { NearbyResultList } from '../../components/public-engagement/service-requests/service-request-nearby-rows';
import { ServiceRequestSurfaceSwitch } from '../../components/public-engagement/service-requests/service-request-surface-switch';
import { sharedServiceRequestSearch } from '../../components/public-engagement/service-requests/service-requests-search';
import { applications } from '../../lib/collections/applications';
import { inspections } from '../../lib/collections/inspections';
import { memberships } from '../../lib/collections/memberships';
import { organizations } from '../../lib/collections/organizations';
import { profiles } from '../../lib/collections/profiles';
import { requested_control_actions } from '../../lib/collections/requested_control_actions';
import { sample_species } from '../../lib/collections/sample_species';
import { samples } from '../../lib/collections/samples';
import { source_reductions } from '../../lib/collections/source_reductions';
import { dayOverview, monthOverview, yearOverview } from './components/overview/overview-fixtures';
import { installMemoryCollections, seedRows } from './lib/collections/memory-collections';
import { STUB_ROW_HEIGHT, stubRailViewportHeight } from './rail-viewport-stub';
import { linkHref, linkHrefs, renderWithRouter } from './router-harness';
import { stubPanelLayout } from './routes/explorer-route-harness';

const HABITAT = 'habitat-1';

/**
 * A manager, for the one component here that hides a link below a floor.
 *
 * The service request header draws its pencil through `hasAtLeastRole`, and the
 * app's controller holds no snapshot outside a session. Nothing else rendered
 * in this file reads the snapshot: the roster takes its role as a prop, and the
 * dashboard, the history card and the surface switch gate nothing.
 */
vi.mock('../../hooks/use-auth-snapshot', async () => {
	const { signedInSnapshotAs } = await import('./routes/route-mock-stand-ins');
	const manager = signedInSnapshotAs('manager');
	return { useAuthSnapshot: () => manager };
});

beforeEach(() => {
	installMemoryCollections();
});

afterEach(cleanup);

/**
 * The habitat History card, one tab at a time.
 *
 * Five rows, five destinations, four different id columns. The card is the
 * shape `tsc` cannot tell apart: `inspection.id` and `sample.id` are both
 * strings, `sample.inspectionId` is the same string as the inspection whose row
 * is one tab over, and a row swapped for its neighbour compiles.
 *
 * A `Tabs` renders one panel at a time, so a case has to press the trigger
 * before the row it wants exists. That is also why the assertion is on every
 * link on screen rather than on one found by name: one entry means the row's
 * first cell carries the link and the rest of the row carries none.
 */
describe('the habitat History card', () => {
	beforeEach(() => {
		seedRows(inspections, [
			{
				id: 'inspection-1',
				habitat_id: HABITAT,
				inspection_date: '2026-08-01',
				inspected_by_profile_id: 'inspector-profile-1',
				is_wet: true,
				dip_count: 4,
				density: null,
				larvae_count: 12,
				has_eggs: false,
				has_first_instar: true,
				has_second_instar: false,
				has_third_instar: false,
				has_fourth_instar: false,
				has_pupae: false,
			},
		]);
		seedRows(samples, [
			{
				id: 'sample-1',
				inspection_id: 'inspection-1',
				display_name: 'North basin dip',
				is_zero_larvae: false,
				has_non_mosquito: false,
				unidentifiable_reason: null,
			},
		]);
		seedRows(sample_species, [
			{
				id: 'sample-species-1',
				sample_id: 'sample-1',
				species_id: 'species-1',
				larvae_count: 12,
			},
		]);
		seedRows(applications, [
			{
				id: 'application-1',
				habitat_id: HABITAT,
				application_date: '2026-08-02',
				applicator_profile_id: 'applicator-profile-1',
				insecticide_id: 'insecticide-1',
				application_method_id: 'application-method-1',
				amount_applied: 3,
				application_unit_id: 'unit-1',
			},
		]);
		seedRows(source_reductions, [
			{
				id: 'source-reduction-1',
				habitat_id: HABITAT,
				source_reduction_date: '2026-08-03',
				source_reduction_method_id: 'source-reduction-method-1',
				technician_profile_id: 'technician-profile-1',
				sources_eliminated_amount: 2,
				sources_eliminated_unit_id: 'unit-1',
			},
		]);
		seedRows(requested_control_actions, [
			{
				id: 'requested-control-action-1',
				habitat_id: HABITAT,
				inspection_id: 'inspection-1',
				collection_id: null,
				control_type: 'application',
				summary: 'Standing water behind the depot',
				requested_by_profile_id: 'requester-profile-1',
				requested_at: new Date('2026-08-04T14:00:00.000Z'),
				resolved_at: null,
			},
		]);
	});

	async function openCard(): Promise<void> {
		renderWithRouter(<HabitatHistoryCard habitatId={HABITAT} />);
		// The tab strip counts every subset, so a trigger showing (1) is the card
		// past its skeleton with the seeded row in hand.
		await waitFor(() => {
			expect(screen.getByRole('tab', { name: /^Inspections \(1\)$/ })).toBeTruthy();
		});
	}

	// `mouseDown`, not `click`. Radix switches the panel on the press rather than
	// on the release, and `fireEvent.click` dispatches neither. A case built on it
	// reads the inspections tab five times and passes four of the five.
	function openTab(name: RegExp): void {
		fireEvent.mouseDown(screen.getByRole('tab', { name }));
	}

	it('opens the inspection a row names, not the habitat it happened at', async () => {
		await openCard();

		expect(linkHrefs()).toEqual(['/larval-surveillance/inspections/inspection-1']);
	});

	it('opens the sample a row names, not the inspection it was taken during', async () => {
		await openCard();
		openTab(/^Samples \(1\)$/);

		expect(linkHrefs()).toEqual(['/larval-surveillance/samples/sample-1']);
	});

	it('opens the application a row names, not the insecticide it applied', async () => {
		await openCard();
		openTab(/^Applications \(1\)$/);

		expect(linkHrefs()).toEqual(['/control-operations/chemical/application-1']);
	});

	it('opens the source reduction a row names, not the method it used', async () => {
		await openCard();
		openTab(/^Source Reductions \(1\)$/);

		expect(linkHrefs()).toEqual(['/control-operations/source-reduction/source-reduction-1']);
	});

	it('opens the request a row names, not the inspection it was raised from', async () => {
		await openCard();
		openTab(/^Requests \(1\)$/);

		expect(linkHrefs()).toEqual(['/operations/requests-for-control/requested-control-action-1']);
	});
});

/**
 * The People roster's two links to a Profile's day.
 *
 * A Profile has no detail page, so both the name (#541) and the row action
 * (#483) go to Daily Work, which is keyed on the Profile, not on the Account
 * behind it and not on the Membership that grants it a role. All three are
 * strings on the same row, and `profiles.user_id` is the one a reader reaching
 * for "the person's id" picks by mistake.
 *
 * Neither link is gated. A Profile nobody signs in as still has a day's work
 * behind it, so the historical row links the same way the linked one does, and
 * the case below is what says that was a decision rather than an oversight.
 */
describe('the People roster', () => {
	beforeEach(() => {
		seedRows(profiles, [
			{
				id: 'profile-1',
				user_id: 'account-1',
				display_name: 'Dana Okafor',
				email: 'dana@example.test',
				is_active: true,
			},
			{
				id: 'profile-2',
				user_id: null,
				display_name: 'Ray Alvarado',
				email: null,
				is_active: true,
			},
		]);
		seedRows(memberships, [
			{
				id: 'membership-1',
				profile_id: 'profile-1',
				role: 'collector',
				status: 'active',
			},
		]);
	});

	// The reader's own role, which the section shows in a badge and nothing here
	// reads. A constant rather than the literal because Biome's `useValidAriaRole`
	// reads a literal `role=` as the ARIA attribute, whatever component it is on.
	const VIEWER_ROLE = 'collector' as const;

	async function openRoster(): Promise<void> {
		renderWithRouter(
			<Suspense fallback={null}>
				<PeopleSection auth={null} canManage={false} role={VIEWER_ROLE} />
			</Suspense>,
		);
		await waitFor(() => {
			expect(screen.getByRole('link', { name: 'Dana Okafor' })).toBeTruthy();
		});
	}

	it('opens the Profile the name belongs to, not the Account behind it', async () => {
		await openRoster();

		expect(linkHref('Dana Okafor')).toBe('/daily-work/profile-1');
	});

	it('sends the row action to the same day the name does', async () => {
		await openRoster();

		// Name then action, per row, in group order: the linked Profile's row
		// first, the historical one's under it. Four entries and no more is what
		// says the badges beside the name are still badges.
		expect(linkHrefs()).toEqual([
			'/daily-work/profile-1',
			'/daily-work/profile-1',
			'/daily-work/profile-2',
			'/daily-work/profile-2',
		]);
	});

	it('links a Profile nobody signs in as, the same as one somebody does', async () => {
		await openRoster();

		expect(linkHref('Ray Alvarado')).toBe('/daily-work/profile-2');
	});
});

/**
 * The Inspections Map/Table switch, which is a destination that carries state.
 *
 * The two surfaces read the same filter params and the sidebar links between
 * them carry none, so a reader who narrowed one arrived at the other unfiltered
 * (#521). The control that fixes it is a `Link` naming its `search`, and `tsc`
 * checks neither half of that: the search type both routes validate to is a
 * plain record, so a switch carrying nothing, or carrying the table's sort to a
 * map with no sort, compiles either way. Only the resolved href says which.
 *
 * The fixture sets five of the eight filters and both of the table's sort
 * params, so a link that carried everything and a link that carried only the
 * shared contract resolve to different addresses.
 */
describe('the Inspections Map/Table switch', () => {
	const TABLE_ADDRESS = {
		from: '2026-08-01',
		to: '2026-08-31',
		water: 'wet',
		density: ['low'],
		regions: ['region-1'],
		sort: 'dips',
		direction: 'asc',
	} as const;

	/**
	 * The five filters as the router writes them: a string param as itself, an
	 * array JSON-encoded and percent-escaped. Spelled out rather than built from
	 * the fixture, so a case cannot agree with a mistake in the encoder.
	 */
	const CARRIED =
		'from=2026-08-01&to=2026-08-31&water=wet&density=%5B%22low%22%5D&regions=%5B%22region-1%22%5D';

	it('carries the filters from the Table to the Map, and leaves the sort behind', () => {
		renderWithRouter(
			<InspectionSurfaceSwitch current="table" search={sharedInspectionSearch(TABLE_ADDRESS)} />,
		);

		expect(linkHref('Map')).toBe(`/larval-surveillance/inspections?${CARRIED}`);
	});

	it('carries the filters from the Map to the Table', () => {
		// The map's own validated search, which is the shared contract already: the
		// sort has no codec here, so an address carrying one arrives without it.
		const mapAddress = {
			from: '2026-08-01',
			to: '2026-08-31',
			water: 'wet',
			density: ['low'],
			regions: ['region-1'],
		};

		renderWithRouter(
			<InspectionSurfaceSwitch current="map" search={sharedInspectionSearch(mapAddress)} />,
		);

		expect(linkHref('Table')).toBe(`/larval-surveillance/inspections/table?${CARRIED}`);
	});

	it('offers the two surfaces and nothing else', () => {
		renderWithRouter(<InspectionSurfaceSwitch current="map" search={{}} />);

		expect(linkHrefs()).toEqual([
			'/larval-surveillance/inspections',
			'/larval-surveillance/inspections/table',
		]);
	});
});

/**
 * The Service Requests Map/Table switch. It carries status and the date window
 * and nothing else: the Table cannot apply the Map's search, Tags or Regions,
 * and carrying one would leave rows on the Table that the filter says are gone.
 */
describe('the Service Requests Map/Table switch', () => {
	const CARRIED = 'status=open&from=2026-08-01&to=2026-08-31';

	it('carries status and dates from the Map to the Table, and leaves the rest behind', () => {
		const mapAddress = {
			status: 'open',
			search: 'standing water',
			tags: ['tag-1'],
			regions: ['region-1'],
			from: '2026-08-01',
			to: '2026-08-31',
		};

		renderWithRouter(
			<ServiceRequestSurfaceSwitch current="map" search={sharedServiceRequestSearch(mapAddress)} />,
		);

		expect(linkHref('Table')).toBe(`/public-engagement/service-requests/table?${CARRIED}`);
	});

	it('carries status and dates from the Table to the Map, and leaves the sort behind', () => {
		const tableAddress = {
			status: 'open',
			from: '2026-08-01',
			to: '2026-08-31',
			sort: 'number',
			direction: 'asc',
		};

		renderWithRouter(
			<ServiceRequestSurfaceSwitch
				current="table"
				search={sharedServiceRequestSearch(tableAddress)}
			/>,
		);

		expect(linkHref('Map')).toBe(`/public-engagement/service-requests?${CARRIED}`);
	});
});

/**
 * The Habitats Map/Table switch. Both surfaces read `/map/habitats`, so every
 * filter applies on both and every filter is carried, Tags, Regions and
 * Untreated included.
 */
describe('the Habitats Map/Table switch', () => {
	const ADDRESS = {
		search: 'ditch',
		status: 'all',
		tagIds: ['tag-1'],
		regions: ['region-1'],
		untreated: true,
	};
	const CARRIED =
		'search=ditch&status=all&tagIds=%5B%22tag-1%22%5D&regions=%5B%22region-1%22%5D&untreated=true';

	it('carries every filter from the Map to the Table, and drops what is not a filter', () => {
		renderWithRouter(
			<HabitatSurfaceSwitch current="map" search={sharedHabitatSearch({ ...ADDRESS, page: 3 })} />,
		);

		expect(linkHref('Table')).toBe(`/larval-surveillance/habitats/table?${CARRIED}`);
	});

	it('carries every filter from the Table to the Map', () => {
		renderWithRouter(
			<HabitatSurfaceSwitch current="table" search={sharedHabitatSearch(ADDRESS)} />,
		);

		expect(linkHref('Map')).toBe(`/larval-surveillance/habitats?${CARRIED}`);
	});
});

/**
 * The Samples Map/Table switch. Both surfaces read `/map/samples`, so every
 * filter is carried, species and regions included.
 */
describe('the Samples Map/Table switch', () => {
	const ADDRESS = {
		from: '2026-08-01',
		to: '2026-08-31',
		status: 'identified',
		species: ['species-1'],
		regions: ['region-1'],
	};
	const CARRIED =
		'from=2026-08-01&to=2026-08-31&status=identified&species=%5B%22species-1%22%5D&regions=%5B%22region-1%22%5D';

	it('carries every filter from the Map to the Table', () => {
		renderWithRouter(<SampleSurfaceSwitch current="map" search={sharedSampleSearch(ADDRESS)} />);

		expect(linkHref('Table')).toBe(`/larval-surveillance/samples/table?${CARRIED}`);
	});

	it('carries every filter from the Table to the Map', () => {
		renderWithRouter(<SampleSurfaceSwitch current="table" search={sharedSampleSearch(ADDRESS)} />);

		expect(linkHref('Map')).toBe(`/larval-surveillance/samples?${CARRIED}`);
	});
});

/**
 * The Dashboard, whose every queue links to an explorer with its filters set
 * so the explorer shows the rows the count counted (#1014).
 *
 * The carried search is the whole point: `from` is the oldest row's date and
 * `to` is today, `status=awaiting`, `awaiting=true`, `problems=true`,
 * `unassigned=true` and the two `statuses` arrays are what turn a count into
 * the same rows on the explorer, and `tsc` checks none of it, since every
 * explorer validates to a plain record. The service requests row carries no
 * window because that explorer takes no date. The server half is a stubbed
 * `fetch`, the Electric reads are memory collections holding one inspection
 * for the people table and nothing else, and today is pinned so the `to`
 * half of each window is a literal here.
 */
describe('the Dashboard', () => {
	const NOW = new Date('2026-09-15T16:00:00Z');

	const SERVER: DashboardResponse = {
		today: '2026-09-15',
		queues: {
			samplesAwaiting: { count: 23, oldest: '2026-08-27' },
			collectionsAwaiting: { count: 41, oldest: '2026-09-03' },
			requestsUnassigned: { count: 6, oldest: '2026-09-11' },
		},
	};

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(NOW);
		vi.stubGlobal('fetch', async () => new Response(JSON.stringify(SERVER), { status: 200 }));
		seedRows(organizations, [{ id: 'org-1', name: 'Test Mosquito Control', settings: {} }]);
		seedRows(profiles, [{ id: 'profile-1', display_name: 'Dana Okafor' }]);
		seedRows(inspections, [
			{
				id: 'inspection-today',
				lat: 40,
				lng: -74,
				inspection_date: '2026-09-15',
				inspected_by_profile_id: 'profile-1',
				is_wet: false,
				created_at: new Date('2026-09-15T15:00:00Z'),
			},
		]);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.useRealTimers();
	});

	async function openDashboard() {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		renderWithRouter(
			<QueryClientProvider client={client}>
				<Suspense fallback={null}>
					<DashboardPage />
				</Suspense>
			</QueryClientProvider>,
		);
		await waitFor(() => screen.getByRole('link', { name: 'Samples awaiting identification' }));
	}

	it('sends each queue to its explorer with the count’s own window', async () => {
		await openDashboard();

		expect(linkHref('Samples awaiting identification')).toBe(
			'/larval-surveillance/samples?status=awaiting&from=2026-08-27&to=2026-09-15',
		);
		expect(linkHref('Collections awaiting identification')).toBe(
			'/adult-surveillance/collections?awaiting=true&from=2026-09-03&to=2026-09-15',
		);
		expect(linkHref('Requests for Control not yet assigned')).toBe(
			'/operations/requests-for-control?status=open&unassigned=true&from=2026-09-11&to=2026-09-15',
		);
		// The service requests explorer opens on this year, so the link spells out
		// All time: an open request received last year is still open.
		expect(linkHref('Open service requests')).toBe(
			'/public-engagement/service-requests?status=open&from=any&to=any',
		);
	});

	it('sends an empty Electric queue to its explorer with the filter and no window', async () => {
		await openDashboard();

		expect(linkHref('Collections with a problem')).toBe(
			'/adult-surveillance/collections?problems=true',
		);
		expect(linkHref('Assignments started and not finished')).toBe(
			'/operations/assignments?statuses=%5B%22inProgress%22%5D',
		);
		expect(linkHref('Missions due today or overdue')).toBe(
			'/operations/missions?statuses=%5B%22scheduled%22%5D',
		);
	});

	it('sends a person to their day', async () => {
		await openDashboard();

		expect(linkHref('Dana Okafor')).toBe('/daily-work/profile-1?date=2026-09-15');
	});
});

/**
 * The Today page (#1216): a count opens its type's explorer over the column's
 * whole period, the service requests link writing `status=all` beside the
 * dates because that explorer defaults to open requests, and the upward line
 * opens the month and the year with the period written explicitly. The table
 * and the line are rendered off a response rather than through the page,
 * which reads the search and navigates and so needs a match this harness
 * never mounts; the chart click is a `navigate` and not a `Link`, so
 * `periodDestination` is asserted in its own suite. The fixture gives the
 * previous column and last year's a different date from the period's, so a
 * link reading the wrong column resolves to a different href.
 */
describe('the Today page', () => {
	function openToday() {
		renderWithRouter(
			<>
				<UpwardLine grain="day" period="2026-09-15" />
				<OverviewTable
					dimmed={false}
					grain="day"
					period="2026-09-15"
					state={{ kind: 'ready', response: dayOverview() }}
				/>
			</>,
		);
	}

	/** The count links in one row, in column order. */
	function rowHrefs(label: string): readonly string[] {
		const row = screen.getByRole('row', { name: new RegExp(`^${label}`) });
		return [...row.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href') ?? '');
	}

	it('sends each count to its explorer over the column’s own day', () => {
		openToday();

		expect(rowHrefs('Inspections')).toEqual([
			'/larval-surveillance/inspections?from=2026-09-15&to=2026-09-15',
			'/larval-surveillance/inspections?from=2026-09-14&to=2026-09-14',
		]);
		expect(rowHrefs('Samples')[0]).toBe(
			'/larval-surveillance/samples?from=2026-09-15&to=2026-09-15',
		);
		expect(rowHrefs('Collections')[0]).toBe(
			'/adult-surveillance/collections?from=2026-09-15&to=2026-09-15',
		);
		expect(rowHrefs('Chemical Applications')[0]).toBe(
			'/control-operations/chemical?from=2026-09-15&to=2026-09-15',
		);
		expect(rowHrefs('Source Reductions')[0]).toBe(
			'/control-operations/source-reduction?from=2026-09-15&to=2026-09-15',
		);
		// Every request received, not the explorer's default of open ones.
		expect(rowHrefs('Service Requests received')[0]).toBe(
			'/public-engagement/service-requests?status=all&from=2026-09-15&to=2026-09-15',
		);
	});

	it('links no ratio', () => {
		openToday();

		expect(rowHrefs('Inspections')).toHaveLength(2);
		expect(rowHrefs('Positive inspections')).toEqual([]);
		expect(rowHrefs('Mosquitoes per collection')).toEqual([]);
	});

	it('sends the upward line to the month and the year, written explicitly', () => {
		openToday();

		expect(linkHref('September 2026')).toBe('/monthly?month=2026-09');
		expect(linkHref('2026')).toBe('/annual?year=2026');
	});
});

/**
 * The Monthly page (#1217): a count opens its explorer over the column's
 * whole month, `to` the last day even on the partial month the fixture cuts
 * through the 15th, and the upward line opens the year.
 */
describe('the Monthly page', () => {
	function openMonthly() {
		renderWithRouter(
			<>
				<UpwardLine grain="month" period="2026-09" />
				<OverviewTable
					dimmed={false}
					grain="month"
					period="2026-09"
					state={{ kind: 'ready', response: monthOverview() }}
				/>
			</>,
		);
	}

	function rowHrefs(label: string): readonly string[] {
		const row = screen.getByRole('row', { name: new RegExp(`^${label}`) });
		return [...row.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href') ?? '');
	}

	it('sends each count to its explorer over the whole month, not the cut', () => {
		openMonthly();

		expect(rowHrefs('Chemical Applications')).toEqual([
			'/control-operations/chemical?from=2026-09-01&to=2026-09-30',
			'/control-operations/chemical?from=2026-08-01&to=2026-08-31',
			'/control-operations/chemical?from=2025-09-01&to=2025-09-30',
		]);
		expect(rowHrefs('Service Requests received')[0]).toBe(
			'/public-engagement/service-requests?status=all&from=2026-09-01&to=2026-09-30',
		);
		expect(rowHrefs('Positive inspections')).toEqual([]);
	});

	it('sends the upward line to the year alone', () => {
		openMonthly();

		expect(linkHref('2026')).toBe('/annual?year=2026');
		expect(screen.queryByRole('link', { name: 'September 2026' })).toBeNull();
	});
});

/**
 * The Annual page (#1218): a count opens its explorer over the whole year,
 * `to` Dec 31 even on the partial year the fixture cuts through Sep 15, and
 * there is no upward line, there being no coarser grain.
 */
describe('the Annual page', () => {
	function openAnnual() {
		renderWithRouter(
			<>
				<UpwardLine grain="year" period="2026" />
				<OverviewTable
					dimmed={false}
					grain="year"
					period="2026"
					state={{ kind: 'ready', response: yearOverview() }}
				/>
			</>,
		);
	}

	function rowHrefs(label: string): readonly string[] {
		const row = screen.getByRole('row', { name: new RegExp(`^${label}`) });
		return [...row.querySelectorAll('a')].map((anchor) => anchor.getAttribute('href') ?? '');
	}

	it('sends each count to its explorer over the whole year, not the cut', () => {
		openAnnual();

		expect(rowHrefs('Collections')).toEqual([
			'/adult-surveillance/collections?from=2026-01-01&to=2026-12-31',
			'/adult-surveillance/collections?from=2025-01-01&to=2025-12-31',
		]);
		expect(rowHrefs('Service Requests received')[0]).toBe(
			'/public-engagement/service-requests?status=all&from=2026-01-01&to=2026-12-31',
		);
		expect(rowHrefs('Mosquitoes per collection')).toEqual([]);
		expect(screen.queryByRole('link', { name: '2026' })).toBeNull();
	});
});

/**
 * The service request header's pencil (#1088).
 *
 * The page keeps its own header module rather than reading `DetailPageShell`,
 * because its column sits beside a map, so the edit destination is declared
 * there and nowhere the shell's pages are asserted. The contact and address ids
 * on the row are the neighbouring strings a `params` reading the wrong field
 * would resolve to.
 */
describe('the service request header', () => {
	it('sends the pencil to the edit form for the request on screen', () => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
		renderWithRouter(
			<QueryClientProvider client={client}>
				<TooltipProvider>
					<ServiceRequestDetailHeader
						askDelete={async (write) => write({})}
						request={{
							id: 'service-request-1',
							organizationId: 'org-1',
							displayName: 12,
							intakeType: 'phone',
							requestDate: '2026-08-04',
							details: 'Standing water behind the garage.',
							contactId: 'contact-1',
							addressId: 'address-1',
							receivedByProfileId: 'profile-1',
							closedAt: null,
							latitude: 30,
							longitude: -90,
						}}
					/>
				</TooltipProvider>
			</QueryClientProvider>,
		);

		expect(linkHref('Edit')).toBe('/public-engagement/service-requests/service-request-1/edit');
	});
});

/**
 * The nearby list on a service request, one row per record kind.
 *
 * Eight kinds through one row, each keyed to its own detail route, which is the
 * shape #582 named: every `to` is well formed, and a category paired with its
 * neighbour's route compiles. The chevron and the title are the row's two links,
 * so each record answers twice, and the id is the assertion.
 */
describe('the nearby list', () => {
	const CATEGORIES: readonly NearbyCategory[] = [
		'habitat',
		'trap',
		'inspection',
		'collection',
		'application',
		'sourceReduction',
		'biocontrol',
		'serviceRequest',
	];

	function nearby(category: NearbyCategory, index: number): NearbyItem {
		return {
			category,
			family: 'larval',
			id: `${category}-${index}`,
			lat: 30,
			lng: -90,
			distanceMeters: index,
			date: '2026-08-01',
			occurredAt: null,
			label: `Record ${index}`,
			placeName: `Record ${index}`,
			refId: null,
			methodRefId: null,
			amount: null,
			unitId: null,
			detail: null,
			stages: null,
			context: null,
			hasBycatch: null,
			tagIds: null,
		};
	}

	// The rows are the rail's virtualised list in a Radix ScrollArea. Radix
	// constructs a ResizeObserver jsdom has not got, and the virtualiser mounts
	// the rows the viewport's `offsetHeight` holds plus overscan. The stub's
	// docblock has the count; this height holds the whole list.
	let restorePanel: () => void;
	let restoreViewport: () => void;
	beforeAll(() => {
		restorePanel = stubPanelLayout();
		restoreViewport = stubRailViewportHeight(CATEGORIES.length * STUB_ROW_HEIGHT);
	});
	afterAll(() => {
		restoreViewport();
		restorePanel();
	});

	const DETAIL_PATH: Readonly<Record<NearbyCategory, string>> = {
		habitat: '/larval-surveillance/habitats',
		trap: '/adult-surveillance/traps',
		inspection: '/larval-surveillance/inspections',
		collection: '/adult-surveillance/collections',
		application: '/control-operations/chemical',
		sourceReduction: '/control-operations/source-reduction',
		biocontrol: '/control-operations/biocontrol',
		serviceRequest: '/public-engagement/service-requests',
	};

	it('sends each kind to its own detail page', () => {
		renderWithRouter(
			<NearbyResultList
				emptyTitle="Nothing Nearby"
				families={new Set(['infrastructure', 'surveillance', 'control', 'publicEngagement'])}
				lookups={{ nameById: new Map(), formatQuantity: String, tagById: new Map() }}
				nearby={{
					data: {
						request: { id: 'sr-1', lat: 30, lng: -90, requestDate: '2026-08-04' },
						radius: { amount: 500, unitCode: 'meter', meters: 500 },
						timeWindow: { daysBefore: 30, daysAfter: 30 },
						dateFrom: '2026-07-05',
						dateTo: '2026-09-03',
						dateToFrom: 'setting',
						families: ['larval', 'adult', 'control', 'publicEngagement'],
						items: CATEGORIES.map(nearby),
						truncated: false,
						limit: 2000,
					},
					isLoading: false,
					isError: false,
					refetch: () => Promise.resolve(),
				}}
				onSelect={() => {}}
				selectedKey={null}
			/>,
		);

		expect(linkHrefs()).toEqual(
			CATEGORIES.flatMap((category, index) => {
				const href = `${DETAIL_PATH[category]}/${category}-${index}`;
				return [href, href];
			}),
		);
	});
});

/**
 * The Daily Work log, one row per record kind.
 *
 * The nine kinds through one row, keyed to the same detail routes the nearby
 * list reads, since both rows resolve their link through `activityRow`. The
 * chevron and the title are the row's two links, so each record answers twice,
 * and the id is the assertion; the route suite for the page renders through a
 * router stand-in whose `Link` has no href, which is why the case is here.
 */
describe('the Daily Work log', () => {
	const CATEGORIES: readonly ActivityEntry['category'][] = [
		'habitat',
		'trap',
		'inspection',
		'collection',
		'application',
		'sourceReduction',
		'biocontrol',
		'outreach',
		'serviceRequest',
	];

	const DETAIL_PATH: Readonly<Record<ActivityEntry['category'], string>> = {
		habitat: '/larval-surveillance/habitats',
		trap: '/adult-surveillance/traps',
		inspection: '/larval-surveillance/inspections',
		collection: '/adult-surveillance/collections',
		application: '/control-operations/chemical',
		sourceReduction: '/control-operations/source-reduction',
		biocontrol: '/control-operations/biocontrol',
		outreach: '/public-engagement/outreach',
		serviceRequest: '/public-engagement/service-requests',
	};

	function activity(category: ActivityEntry['category'], index: number): ActivityEntry {
		return {
			category,
			family: 'larval',
			involvement: 'primary',
			role: 'created',
			id: `${category}-${index}`,
			lat: 30,
			lng: -90,
			date: '2026-08-01',
			occurredAt: null,
			label: `Record ${index}`,
			placeName: `Record ${index}`,
			refId: null,
			methodRefId: null,
			amount: null,
			unitId: null,
			detail: null,
			stages: null,
			context: null,
			hasBycatch: null,
			tagIds: null,
		};
	}

	it.each(CATEGORIES)('sends a %s to its own detail page', (category) => {
		const index = CATEGORIES.indexOf(category);
		renderWithRouter(
			<ActivityLog
				families={[{ family: 'larval', entries: [activity(category, index)] }]}
				lookups={{ nameById: new Map(), formatQuantity: String, tagById: new Map() }}
				message={null}
				onSelect={() => {}}
				selectedKey={null}
				timeZone={undefined}
			/>,
		);

		const href = `${DETAIL_PATH[category]}/${category}-${index}`;
		expect(linkHrefs()).toEqual([href, href]);
	});
});

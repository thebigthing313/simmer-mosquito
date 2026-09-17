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
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { applications } from '../../lib/collections/applications';
import { inspections } from '../../lib/collections/inspections';
import { memberships } from '../../lib/collections/memberships';
import { organizations } from '../../lib/collections/organizations';
import { profiles } from '../../lib/collections/profiles';
import { requested_control_actions } from '../../lib/collections/requested_control_actions';
import { sample_species } from '../../lib/collections/sample_species';
import { samples } from '../../lib/collections/samples';
import { source_reductions } from '../../lib/collections/source_reductions';
import type { DashboardResponse } from '../../routes/-dashboard-data';
import { DashboardPage } from '../../routes/-dashboard-page';
import { HabitatHistoryCard } from '../../routes/-habitat-detail';
import { InspectionSurfaceSwitch } from '../../routes/larval-surveillance/-inspection-surface-switch';
import { sharedInspectionSearch } from '../../routes/larval-surveillance/-inspections-search';
import { PeopleSection } from '../../routes/my-organization/-components/people';
import { ServiceRequestDetailHeader } from '../../routes/public-engagement/service-requests/-service-request-detail-header';
import type {
	NearbyCategory,
	NearbyItem,
} from '../../routes/public-engagement/service-requests/-service-request-nearby';
import { NearbyResultList } from '../../routes/public-engagement/service-requests/-service-request-nearby-rows';
import { installMemoryCollections, seedRows } from './lib/collections/memory-collections';
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
 * The Dashboard, whose every queue links to an explorer with its filters set
 * so the explorer shows the rows the count counted (#1014).
 *
 * The carried search is the whole point: `from` is the oldest row's date and
 * `to` is today, `status=awaiting`, `awaiting=true`, `problems=true`,
 * `unassigned=true` and the two `statuses` arrays are what turn a count into
 * the same rows on the explorer, and `tsc` checks none of it, since every
 * explorer validates to a plain record. The service requests row carries no
 * window because that explorer takes no date. The server half is a stubbed
 * `fetch`, the four Electric queues are empty memory collections, and today is
 * pinned so the `to` half of each window is a literal here.
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
		untreatedHabitats: { count: 5, oldest: '2026-09-09' },
		activity: {
			window: { from: '2026-09-09', to: '2026-09-15' },
			priorWindow: { from: '2026-09-02', to: '2026-09-08' },
			types: {
				inspections: { count: 1, prior: 0 },
				samples: null,
				collections: null,
				applications: null,
				sourceReductions: null,
				releases: null,
				serviceRequests: null,
				outreachActions: null,
			},
		},
		peopleToday: [{ profileId: 'profile-1', records: 3, lastAt: '2026-09-15T18:52:00Z' }],
	};

	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(NOW);
		vi.stubGlobal('fetch', async () => new Response(JSON.stringify(SERVER), { status: 200 }));
		seedRows(organizations, [{ id: 'org-1', name: 'Test Mosquito Control', settings: {} }]);
		seedRows(profiles, [{ id: 'profile-1', display_name: 'Dana Okafor' }]);
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
		// The service requests explorer takes no date, so the link carries none.
		expect(linkHref('Open service requests')).toBe(
			'/public-engagement/service-requests?status=open',
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

	it('sends the banner to the untreated filter and a person to their day', async () => {
		await openDashboard();

		expect(linkHref(/5 untreated habitats/)).toBe('/larval-surveillance/habitats?untreated=true');
		expect(linkHref('Dana Okafor')).toBe('/daily-work/profile-1?date=2026-09-15');
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
	// The rows are the rail's virtualised list in a Radix ScrollArea, which
	// measures itself with a ResizeObserver jsdom has not got, and mounts only
	// the rows a viewport of no height would show.
	beforeAll(stubPanelLayout);

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

	// One render per kind rather than eight rows in one list: the rail mounts
	// the rows a viewport of no height would show plus its overscan, which is
	// seven, and the eighth kind fell off the end of a single render.
	it.each(CATEGORIES)('sends a %s to its own detail page', (category) => {
		const index = CATEGORIES.indexOf(category);
		renderWithRouter(
			<NearbyResultList
				emptyTitle="Nothing nearby"
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
						items: [nearby(category, index)],
					},
					isLoading: false,
					isError: false,
					refetch: () => Promise.resolve(),
				}}
				onSelect={() => {}}
				selectedKey={null}
			/>,
		);

		const href = `${DETAIL_PATH[category]}/${category}-${index}`;
		expect(linkHrefs()).toEqual([href, href]);
	});
});

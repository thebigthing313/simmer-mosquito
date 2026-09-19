/** @vitest-environment jsdom */

/**
 * The five domain overviews rendered whole, each panel through the three states
 * that draw no rows: the read failed, the read has not answered, the read
 * answered with nothing.
 *
 * Every sentence a panel says in those states is written out below, panel by
 * panel, and asserted as the whole text of one element. That is the register
 * #936 asked for: the fork behind each panel was hand-written sixteen times
 * and asserted nowhere, and moving it onto `PanelRows` is only safe if what a
 * person reads on each panel is the same string before and after. The count
 * pill is asserted beside the sentence, because each panel derives it from
 * readiness and the pill has to read the same too: none while the read is
 * unsettled, `0` once it has answered with nothing.
 *
 * The reads are the mocks. Each overview's data hooks answer off one harness
 * state, so a case sets the state, renders the route and reads the panels; what
 * is on screen is the route module's own words. The router is the stand-in
 * beside the route suites, so no route tree is imported.
 */

import { pageContainer } from '@simmer-mosquito/ui-web/components/page-container';
import { cleanup, type RenderResult, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { preloadRouteComponent } from './explorer-route-harness';

type ReadState = 'error' | 'loading' | 'empty';

const harness = vi.hoisted(() => ({
	state: 'loading' as ReadState,
	/** Whether any collection method sets an action threshold, for the adult overview. */
	thresholds: true,
	/**
	 * Whether the operations reads answer with one row each rather than none.
	 * Read under `state: 'empty'` only, since a read that failed or has not
	 * answered holds no rows whatever the flag says.
	 */
	operationsRows: false,
}));

/** What every `isReady`/`isError` hook answers for the harness state. */
function reading() {
	return { isError: harness.state === 'error', isReady: harness.state === 'empty' };
}

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('./route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => ({}));
});

vi.mock('../../../hooks/use-organization-time-zone', () => ({
	useOrganizationTimeZone: () => 'America/New_York',
}));

vi.mock('../../../hooks/queries/use-organization-settings', async () => {
	const { resolveOrganizationSettings } = await import('@simmer-mosquito/domain');
	return { useOrganizationSettings: () => resolveOrganizationSettings(undefined).settings };
});

// --- larval surveillance -----------------------------------------------------

vi.mock('../../../hooks/queries/use-larval-activity-for-date', () => ({
	useLarvalActivityForDate: () => ({ rows: [], ...reading() }),
}));

vi.mock('../../../hooks/queries/use-heavy-larval-activity', () => ({
	useHeavyLarvalActivity: () => ({ rows: [], ...reading() }),
}));

vi.mock('../../../hooks/larval-surveillance/use-species-composition', () => ({
	useSpeciesComposition: () => ({ totals: [], grandTotal: 0, ...reading() }),
}));

// The one hook exposing `isLoading` rather than `isReady`.
vi.mock('../../../hooks/larval-surveillance/use-samples-awaiting', () => ({
	useSamplesAwaiting: () => ({
		samples: [],
		total: 0,
		isLoading: harness.state === 'loading',
		isError: harness.state === 'error',
	}),
}));

// --- adult surveillance ------------------------------------------------------

vi.mock('../../../hooks/queries/use-recent-collections', () => ({
	useRecentCollections: () => ({ collections: [], ...reading() }),
}));

vi.mock('../../../hooks/queries/use-adult-species-composition', () => ({
	useAdultSpeciesComposition: () => ({ totals: [], grandTotal: 0, ...reading() }),
}));

vi.mock('../../../hooks/queries/use-collections-awaiting-identification', () => ({
	useCollectionsAwaitingIdentification: () => ({ awaiting: [], ...reading() }),
}));

vi.mock('../../../hooks/queries/use-collections-over-threshold', () => ({
	useCollectionsOverThreshold: () => ({
		collections: [],
		hasConfiguredThresholds: harness.thresholds,
		...reading(),
	}),
}));

// --- control operations ------------------------------------------------------

vi.mock('../../../hooks/queries/use-control-actions-for-day', () => ({
	useControlActionsForDay: () => ({ actions: [], ...reading() }),
}));

vi.mock('../../../hooks/queries/use-insecticide-usage', () => ({
	useInsecticideUsage: () => ({ usage: [], ...reading() }),
}));

vi.mock('../../../hooks/queries/use-recent-source-reductions', () => ({
	useRecentSourceReductions: () => ({ actions: [], ...reading() }),
}));
vi.mock('../../../hooks/queries/use-recent-biocontrol-actions', () => ({
	useRecentBiocontrolActions: () => ({ actions: [], ...reading() }),
}));

vi.mock('../../../hooks/queries/use-control-catalog-counts', () => ({
	useControlCatalogCounts: () => ({
		applicationMethods: 0,
		insecticides: 0,
		formulations: 0,
		sourceReductionMethods: 0,
		biocontrolMethods: 0,
	}),
}));

vi.mock('../../../hooks/queries/use-unit-labels', () => ({
	useUnitLabels: () => ({ all: [], byId: new Map(), byCode: new Map() }),
}));

// --- public engagement -------------------------------------------------------

vi.mock('../../../hooks/queries/use-organization-service-requests', () => ({
	useOrganizationServiceRequests: () => ({
		requests: [],
		openRequests: [],
		openCount: 0,
		...reading(),
	}),
}));

vi.mock('../../../hooks/queries/use-request-parties', () => ({
	useRequestParties: () => ({ contactById: new Map(), addressById: new Map(), isReady: true }),
}));

vi.mock('../../../hooks/queries/use-recent-outreach', () => ({
	useRecentOutreachActions: () => ({ actions: [], ...reading() }),
}));

vi.mock('../../../hooks/queries/use-service-request-feed', () => ({
	useServiceRequestFeed: () => ({ events: [], ...reading() }),
}));

vi.mock('../../../hooks/queries/use-profile-names', () => ({
	useProfileNames: () => new Map<string, string>(),
}));

// --- operations --------------------------------------------------------------

/**
 * One row per operations panel, each in the state its panel keeps: an
 * unresolved request, an assignment not yet started, a mission still scheduled.
 * The three panels filter on those states in memory, so a row in any other
 * state would count as empty and prove nothing about the rows branch.
 */
const OPERATIONS_ROWS = vi.hoisted(() => {
	const scheduled = new Date('2026-09-17T14:00:00.000Z');
	return {
		request: {
			id: 'request-1',
			controlType: 'larvicide',
			summary: 'Standing water behind the depot',
			recommendedMethodId: null,
			requestedByProfileId: null,
			requestedAt: scheduled,
			resolvedAt: null,
			lat: 0,
			lng: 0,
		},
		assignment: {
			id: 'assignment-1',
			assignmentName: 'North ditch sweep',
			assignmentDate: '2026-09-17',
			assignedToProfileId: null,
			dueAt: null,
			startedAt: null,
			completedAt: null,
			cancelledAt: null,
		},
		mission: {
			id: 'mission-1',
			missionName: 'Evening fog run',
			controlType: 'adulticide',
			plannedMethodId: null,
			assignedToProfileId: null,
			scheduledStartAt: scheduled,
			startedAt: null,
			completedAt: null,
			cancelledAt: null,
		},
	};
});

/** The operations reads expose `isLoading` beside `isReady`, so both are derived here. */
function operationsReading<Row>(row: Row) {
	const ready = harness.state === 'empty';
	return {
		rows: ready && harness.operationsRows ? [row] : [],
		isLoading: harness.state === 'loading',
		isReady: ready,
		isError: harness.state === 'error',
	};
}

vi.mock('../../../hooks/queries/use-profile-roster', () => ({
	useProfileRoster: () => [],
}));

vi.mock('../../../hooks/explorer/use-control-method-names', () => ({
	useControlMethodNames: () => new Map<string, string>(),
}));

vi.mock('../../../hooks/queries/use-requested-control-actions', () => ({
	useRequestedControlActions: () => {
		const { rows, ...rest } = operationsReading(OPERATIONS_ROWS.request);
		return { requests: rows, ...rest };
	},
}));

vi.mock('../../../hooks/queries/use-assignments', () => ({
	useAssignments: () => {
		const { rows, ...rest } = operationsReading(OPERATIONS_ROWS.assignment);
		return { assignments: rows, ...rest };
	},
}));

vi.mock('../../../hooks/queries/use-assignment-item-counts', () => ({
	useAssignmentItemCounts: () => ({ countsById: new Map(), isReady: false }),
}));

vi.mock('../../../hooks/queries/use-missions', () => ({
	useMissions: () => {
		const { rows, ...rest } = operationsReading(OPERATIONS_ROWS.mission);
		return { missions: rows, ...rest };
	},
}));

vi.mock('../../../hooks/queries/use-mission-item-counts', () => ({
	useMissionItemCounts: () => ({ countsById: new Map(), isReady: false }),
}));

// --- the register ------------------------------------------------------------

/** What one panel says in the two states that draw a sentence. */
interface PanelWords {
	/** The heading, exactly as the `Panel` draws it. */
	readonly title: string;
	readonly unavailable: string;
	readonly empty: string;
	/** Whether the header carries a count pill at all; the species panel has none. */
	readonly counted?: false;
}

interface OverviewWords {
	readonly name: string;
	readonly load: () => Promise<{
		readonly Route: { readonly options: { readonly component?: unknown } };
	}>;
	readonly panels: readonly PanelWords[];
}

const OVERVIEWS: readonly OverviewWords[] = [
	{
		name: 'larval surveillance',
		load: () => import('../../../routes/larval-surveillance/index'),
		panels: [
			{
				title: 'Daily Inspections',
				unavailable: 'Inspection activity is unavailable right now.',
				empty: 'No inspections recorded on this day.',
			},
			{
				title: 'Species Composition',
				unavailable: 'Species data is unavailable right now.',
				empty: 'No larvae identified in the last 7 days.',
				counted: false,
			},
			{
				title: 'Awaiting Identification',
				unavailable: 'Sample data is unavailable right now.',
				empty: 'No samples awaiting identification. Nice work.',
			},
			{
				title: 'Heavy & Very Heavy · Last 14 Days',
				unavailable: 'Inspection activity is unavailable right now.',
				empty: 'No heavy or very heavy inspections in the last 14 days.',
			},
		],
	},
	{
		name: 'adult surveillance',
		load: () => import('../../../routes/adult-surveillance/index'),
		panels: [
			{
				title: 'Recent Collections · Last 14 Days',
				unavailable: 'Collection activity is unavailable right now.',
				empty: 'No collections retrieved in the last 14 days.',
			},
			{
				title: 'Species Composition',
				unavailable: 'Species data is unavailable right now.',
				empty: 'No specimens identified in the last 7 days.',
				counted: false,
			},
			{
				title: 'Awaiting Identification',
				unavailable: 'Collection data is unavailable right now.',
				empty: 'No collections awaiting identification. Nice work.',
			},
			{
				title: 'Over Action Threshold · Last 14 Days',
				unavailable: 'Collection activity is unavailable right now.',
				empty: "No collection reached its method's action threshold in the last 14 days.",
			},
			{
				title: 'Flagged for Attention · Last 14 Days',
				unavailable: 'Collection activity is unavailable right now.',
				empty: 'No collections were flagged with a problem in the last 14 days.',
			},
		],
	},
	{
		name: 'control operations',
		load: () => import('../../../routes/control-operations/index'),
		panels: [
			{
				title: 'Daily Control Actions',
				unavailable: 'Control activity is unavailable right now.',
				empty: 'No control actions recorded on this day.',
			},
			{
				title: 'Insecticide Usage',
				unavailable: 'Application activity is unavailable right now.',
				empty: 'No insecticide applied in the last 7 days.',
			},
			{
				title: 'Source Reductions',
				unavailable: 'Source reduction activity is unavailable right now.',
				empty: 'No source reductions recorded in the last 14 days.',
			},
			{
				title: 'Biocontrol Releases',
				unavailable: 'Biocontrol activity is unavailable right now.',
				empty: 'No biocontrol releases recorded in the last 14 days.',
			},
		],
	},
	{
		name: 'public engagement',
		load: () => import('../../../routes/public-engagement/index'),
		panels: [
			{
				title: 'Open Service Requests',
				unavailable: 'Service requests are unavailable right now.',
				empty: 'No open service requests.',
			},
			{
				title: 'Recent Outreach Actions · Last 14 Days',
				unavailable: 'Outreach activity is unavailable right now.',
				empty: 'No outreach recorded in the last 14 days.',
			},
			{
				title: 'Service Request Activity · Last 7 Days',
				unavailable: 'Service request activity is unavailable right now.',
				empty: 'No service request activity in the last 7 days.',
			},
		],
	},
	{
		name: 'operations',
		load: () => import('../../../routes/operations/index'),
		panels: [
			{
				title: 'Open Requests for Control',
				unavailable: 'Requests are unavailable right now.',
				empty: 'No control work is waiting to be scheduled.',
			},
			{
				title: 'Active Assignments',
				unavailable: 'Assignments are unavailable right now.',
				empty: 'No assignment is scheduled or running in this window.',
			},
			{
				title: 'Scheduled Missions',
				unavailable: 'Missions are unavailable right now.',
				empty: 'No mission is scheduled or running in this window.',
			},
		],
	},
];

/** What each operations panel draws for the one row its read answers with. */
const OPERATIONS_PANEL_ROWS = [
	{ title: 'Open Requests for Control', primary: OPERATIONS_ROWS.request.summary },
	{ title: 'Active Assignments', primary: OPERATIONS_ROWS.assignment.assignmentName },
	{ title: 'Scheduled Missions', primary: OPERATIONS_ROWS.mission.missionName },
] as const;

/**
 * The adult overview's fifth branch, between the placeholder and the count: an
 * empty list under no configured threshold says something else.
 */
const NO_THRESHOLD = 'No collection method sets an action threshold. Set one.';

// --- reading a panel ---------------------------------------------------------

/** The card whose heading reads `title`, so every assertion is scoped to one panel. */
function panel(title: string): HTMLElement {
	const heading = screen.getByRole('heading', { name: title });
	const card = heading.closest('[data-slot="card"]');
	if (card === null) {
		throw new Error(`No panel around the heading ${title}.`);
	}
	return card as HTMLElement;
}

/** The count pill beside a panel's heading, or none. */
function countPill(title: string): string | null {
	const heading = screen.getByRole('heading', { name: title });
	const pill = heading.nextElementSibling;
	return pill === null ? null : pill.textContent;
}

/**
 * Whether some element in the panel says exactly `sentence` and nothing else.
 * The whole text of one element, so a sentence that gained or lost a word, or
 * had one put beside it, fails here.
 */
function saysExactly(card: HTMLElement, sentence: string): boolean {
	return within(card).queryAllByText((_, element) => element?.textContent === sentence).length > 0;
}

function drawsPlaceholder(card: HTMLElement): boolean {
	return card.querySelectorAll('[aria-hidden="true"] .animate-pulse').length > 0;
}

const components = new Map<string, () => ReactNode>();

beforeAll(async () => {
	for (const overview of OVERVIEWS) {
		components.set(overview.name, await preloadRouteComponent(overview.load, overview.name));
	}
}, 300_000);

beforeEach(() => {
	harness.state = 'loading';
	harness.thresholds = true;
	harness.operationsRows = false;
});

afterEach(cleanup);

function renderOverview(name: string): RenderResult {
	const Component = components.get(name);
	if (Component === undefined) {
		throw new Error(`The ${name} overview was not preloaded.`);
	}
	return render(<Component />);
}

/** The class `pageContainer` names for a measure, so the assertion cannot drift from the register. */
function measureClass(measure: 'page' | 'record'): string {
	const found = pageContainer({ measure })
		.split(/\s+/)
		.find((cls) => cls.startsWith('max-w-'));
	if (found === undefined) {
		throw new Error(`pageContainer names no ${measure} measure`);
	}
	return found;
}

describe.each(OVERVIEWS)('the $name overview', ({ name, panels }) => {
	// The route-loading skeleton reserves the record measure, so an overview
	// back in the 1200 column would arrive 416px narrower than the skeleton it
	// replaces on a wide screen (#1043, #1049).
	it('draws in the record measure the route-loading skeleton reserves', () => {
		harness.state = 'empty';
		const { container } = renderOverview(name);

		expect(container.querySelector(`.${CSS.escape(measureClass('record'))}`)).not.toBeNull();
		expect(container.querySelector(`.${CSS.escape(measureClass('page'))}`)).toBeNull();
	});

	it('says each panel is unavailable when its read fails, with no count', () => {
		harness.state = 'error';
		renderOverview(name);

		for (const words of panels) {
			const card = panel(words.title);
			expect(saysExactly(card, words.unavailable), words.title).toBe(true);
			expect(saysExactly(card, words.empty), words.title).toBe(false);
			expect(drawsPlaceholder(card), words.title).toBe(false);
			expect(countPill(words.title), words.title).toBeNull();
		}
	});

	it('draws a placeholder and no sentence while each read is unsettled, with no count', () => {
		harness.state = 'loading';
		renderOverview(name);

		for (const words of panels) {
			const card = panel(words.title);
			expect(drawsPlaceholder(card), words.title).toBe(true);
			expect(saysExactly(card, words.unavailable), words.title).toBe(false);
			expect(saysExactly(card, words.empty), words.title).toBe(false);
			expect(countPill(words.title), words.title).toBeNull();
		}
	});

	it('says each panel is empty once its read answers with nothing, counting zero', () => {
		harness.state = 'empty';
		renderOverview(name);

		for (const words of panels) {
			const card = panel(words.title);
			expect(saysExactly(card, words.empty), words.title).toBe(true);
			expect(saysExactly(card, words.unavailable), words.title).toBe(false);
			expect(drawsPlaceholder(card), words.title).toBe(false);
			expect(countPill(words.title), words.title).toBe(words.counted === false ? null : '0');
		}
	});
});

describe('the adult overview under no configured threshold', () => {
	it('says so instead of calling the fortnight quiet', () => {
		harness.state = 'empty';
		harness.thresholds = false;
		renderOverview('adult surveillance');

		const card = panel('Over Action Threshold · Last 14 Days');
		expect(saysExactly(card, NO_THRESHOLD)).toBe(true);
		expect(
			saysExactly(card, "No collection reached its method's action threshold in the last 14 days."),
		).toBe(false);
		expect(countPill('Over Action Threshold · Last 14 Days')).toBe('0');
	});

	// The failure and the placeholder outrank it: an unset threshold is not what
	// a read that failed or has not answered should say.
	it('still says unavailable and still draws the placeholder ahead of it', () => {
		harness.thresholds = false;
		harness.state = 'error';
		renderOverview('adult surveillance');
		expect(saysExactly(panel('Over Action Threshold · Last 14 Days'), NO_THRESHOLD)).toBe(false);
		cleanup();

		harness.state = 'loading';
		renderOverview('adult surveillance');
		const card = panel('Over Action Threshold · Last 14 Days');
		expect(saysExactly(card, NO_THRESHOLD)).toBe(false);
		expect(drawsPlaceholder(card)).toBe(true);
	});
});

/**
 * The rows branch, asserted on the one overview whose panels filter their rows
 * in memory: a request that is still open, an assignment not yet started and a
 * mission still scheduled each reach the list, and the empty sentence goes.
 */
describe('the operations overview with one row per panel', () => {
	it('lists each row under a count of one and says nothing else', () => {
		harness.state = 'empty';
		harness.operationsRows = true;
		renderOverview('operations');

		const register = OVERVIEWS.find((overview) => overview.name === 'operations')?.panels ?? [];
		for (const words of OPERATIONS_PANEL_ROWS) {
			const card = panel(words.title);
			const list = card.querySelector('ul');
			expect(list, words.title).not.toBeNull();
			expect(within(list as HTMLElement).getAllByRole('listitem'), words.title).toHaveLength(1);
			expect(saysExactly(card, words.primary), words.title).toBe(true);
			expect(drawsPlaceholder(card), words.title).toBe(false);
			expect(countPill(words.title), words.title).toBe('1');
			const empty = register.find((entry) => entry.title === words.title)?.empty;
			expect(empty, words.title).toBeDefined();
			expect(saysExactly(card, empty ?? ''), words.title).toBe(false);
		}
	});
});

/** @vitest-environment jsdom */

/**
 * The header of the two worklists, Missions and Assignments: the count beside
 * the title and the create control, in the header and in the empty state
 * (#1687).
 *
 * Both controls are drawn through `CreateControl` so `check:nav-labels` reads
 * their labels, and both counts come from `recordCount`. Neither move should
 * change what a reader sees, so each route is rendered whole with no, one and
 * three rows, and asked for the count's text and for each control's name and
 * destination. The rows are the fewest fields the list and the worklist hook
 * read; the data hooks, the split page and the map are stand-ins, as in
 * `worklist-date-chip.test.tsx`.
 */

import { cleanup, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { preloadRouteComponent, renderExplorer } from '../explorer-route-harness';

const rows = vi.hoisted(() => ({
	/** How many rows each data hook hands back on the next render. */
	total: 0,
	/** The search the router answers with: none, and one object so the store snapshot holds still. */
	search: {} as Record<string, unknown>,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => rows.search);
});

vi.mock('../../../../hooks/use-auth-snapshot', async () => {
	const { authSnapshotStandIn } = await import('./refusal-harness');
	return authSnapshotStandIn();
});

vi.mock('../../../../hooks/use-organization-time-zone', () => ({
	useOrganizationTimeZone: () => 'America/New_York',
}));

vi.mock('../../../../hooks/explorer/use-catalog-options', async (original) => ({
	...(await original<typeof import('../../../../hooks/explorer/use-catalog-options')>()),
	useCatalogOptions: () => ({ options: [], nameById: new Map() }),
}));

vi.mock('../../../../hooks/explorer/use-control-method-names', () => ({
	useControlMethodNames: () => new Map(),
}));

/** One unstarted row with nobody assigned, which every status and assignee filter passes. */
function row(index: number) {
	return {
		id: `row-${index}`,
		missionName: `Mission ${index}`,
		assignmentName: `Assignment ${index}`,
		controlType: 'application',
		plannedMethodId: null,
		assignedToProfileId: null,
		scheduledStartAt: new Date('2026-10-13T12:00:00Z'),
		assignmentDate: '2026-10-13',
		dueAt: null,
		startedAt: null,
		completedAt: null,
		cancelledAt: null,
	};
}

const rowSets = new Map<number, ReturnType<typeof row>[]>();

/**
 * The rows for the current total, one array per total. A fresh array on every
 * render reads to the page as new data every render, and it never settles.
 */
function rowsNow() {
	let set = rowSets.get(rows.total);
	if (set === undefined) {
		set = Array.from({ length: rows.total }, (_, index) => row(index));
		rowSets.set(rows.total, set);
	}
	return set;
}

vi.mock('../../../../hooks/queries/use-missions', () => ({
	useMissions: () => ({ missions: rowsNow(), isLoading: false, isReady: true, isError: false }),
}));

vi.mock('../../../../hooks/queries/use-mission-item-counts', () => ({
	useMissionItemCounts: () => ({ countsById: new Map() }),
}));

vi.mock('../../../../hooks/operations/use-mission-stop-views', () => ({
	useMissionStopViews: () => ({ stops: [] }),
}));

vi.mock('../../../../hooks/queries/use-assignments', () => ({
	useAssignments: () => ({
		assignments: rowsNow(),
		isLoading: false,
		isReady: true,
		isError: false,
	}),
}));

vi.mock('../../../../hooks/queries/use-assignment-item-counts', () => ({
	useAssignmentItemCounts: () => ({ countsById: new Map() }),
}));

vi.mock('../../../../hooks/operations/use-assignment-stops', () => ({
	useAssignmentStops: () => ({
		stops: [],
		features: [],
		counts: { total: 0, completed: 0, skipped: 0, pending: 0, handled: 0 },
		isLoading: false,
	}),
}));

vi.mock('../../../../components/app-shell/outlet/map-split-page', () => ({
	MapSplitPage: ({ children }: { readonly children?: ReactNode }) => <>{children}</>,
}));

vi.mock('../../../../components/map/stop-sequence-map', () => ({
	StopSequenceMap: () => null,
}));

let Missions: () => ReactNode;
let Assignments: () => ReactNode;

beforeAll(async () => {
	Missions = await preloadRouteComponent(
		() => import('../../../../routes/operations/missions/index'),
		'missions index',
	);
	Assignments = await preloadRouteComponent(
		() => import('../../../../routes/operations/assignments/index'),
		'assignments index',
	);
}, 300_000);

beforeEach(() => {
	rows.total = 0;
});

afterEach(cleanup);

describe.each([
	{
		name: 'Missions',
		page: () => Missions,
		label: 'Create Mission',
		to: '/operations/missions/create',
		counts: ['0 missions', '1 mission', '3 missions'],
	},
	{
		name: 'Assignments',
		page: () => Assignments,
		label: 'Create Assignment',
		to: '/operations/assignments/create',
		counts: ['0 assignments', '1 assignment', '3 assignments'],
	},
])('$name', ({ page, label, to, counts }) => {
	it.each([0, 1, 3])('counts %i rows the way it always has', (total) => {
		rows.total = total;
		renderExplorer(page());

		expect(screen.getByText(counts[[0, 1, 3].indexOf(total)] ?? '')).toBeTruthy();
	});

	it('draws the create control in the header and in the empty state', () => {
		renderExplorer(page());

		const links = screen.getAllByRole('link', { name: label });
		expect(links).toHaveLength(2);
		for (const link of links) {
			expect(link.getAttribute('href')).toBe(to);
		}
	});

	it('draws the create control in the header alone once there are rows', () => {
		rows.total = 1;
		renderExplorer(page());

		expect(screen.getAllByRole('link', { name: label })).toHaveLength(1);
	});
});

/** @vitest-environment jsdom */

/**
 * The date window's chip on the two worklists, Missions and Assignments
 * (#1453).
 *
 * Both pages hold their window in the URL as `from` and `to` and open on the
 * schedule window, and both used to decide whether to draw the chip bar from
 * their set filters alone. So a window moved with no other filter set drew no
 * chip and no "Clear all", and the list was narrower than the bar admitted.
 * Each route is rendered whole and asked three things: the default window with
 * no set filter draws no bar, a moved window draws a `Dates:` chip and "Clear
 * all", and removing that chip writes the schedule window back and leaves the
 * status, control type and assignee chips where they were.
 *
 * The router is `routerStandIn` handed `setSearch`, so its navigation writes
 * the search back to the stand-in URL and tells the mounted hooks, and a
 * removed chip is read back off the URL it wrote. The data hooks hand back no
 * rows, the split page renders its children and the worklist map is nothing,
 * since Mapbox GL has no jsdom.
 */

import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { datePresetRange, SCHEDULE_WINDOW } from '../../../../lib/date-presets';
import { todayInTimeZone } from '../../../../lib/local-date';
import { preloadRouteComponent, renderExplorer } from '../explorer-route-harness';

const url = vi.hoisted(() => ({
	/** The Organization's zone, which both pages resolve today in. */
	timeZone: 'America/New_York',
	/** What the stand-in router answers for `useSearch`, rewritten by each navigation. */
	search: {} as Record<string, unknown>,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => url.search, undefined, {
		setSearch: (next) => {
			url.search = next;
		},
	});
});

vi.mock('../../../../hooks/use-auth-snapshot', async () => {
	const { authSnapshotStandIn } = await import('./refusal-harness');
	return authSnapshotStandIn();
});

vi.mock('../../../../hooks/use-organization-time-zone', () => ({
	useOrganizationTimeZone: () => url.timeZone,
}));

vi.mock('../../../../hooks/explorer/use-personnel-options', () => ({
	usePersonnelOptions: () => ({ options: [], nameById: new Map() }),
}));

vi.mock('../../../../hooks/explorer/use-control-method-names', () => ({
	useControlMethodNames: () => new Map(),
}));

vi.mock('../../../../hooks/queries/use-missions', () => ({
	useMissions: () => ({ missions: [], isLoading: false, isReady: true, isError: false }),
}));

vi.mock('../../../../hooks/queries/use-mission-item-counts', () => ({
	useMissionItemCounts: () => ({ countsById: new Map() }),
}));

vi.mock('../../../../hooks/operations/use-mission-stop-views', () => ({
	useMissionStopViews: () => ({ stops: [] }),
}));

vi.mock('../../../../hooks/queries/use-assignments', () => ({
	useAssignments: () => ({ assignments: [], isLoading: false, isReady: true, isError: false }),
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

vi.mock('../../../../components/operations/worklist-map', () => ({
	WorklistMap: () => null,
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
	url.search = {};
});

afterEach(cleanup);

/** The window both pages open on, resolved the way they resolve it. */
function scheduleWindow(): { readonly from: string; readonly to: string } {
	return datePresetRange(SCHEDULE_WINDOW, todayInTimeZone(url.timeZone));
}

/** The window's start moved a day earlier, with the end left on the default. */
function movedFrom(): string {
	const from = new Date(`${scheduleWindow().from}T00:00:00Z`);
	from.setUTCDate(from.getUTCDate() - 1);
	return from.toISOString().slice(0, 10);
}

function render(page: () => ReactNode, search: Record<string, unknown>): void {
	url.search = search;
	renderExplorer(page);
}

function dateChipRemover(): HTMLElement {
	return screen.getByRole('button', { name: /^Remove Dates: .* filter$/ });
}

/**
 * The set filters each page carries beside its window, as the URL spells them,
 * and the chips they draw. `unassigned` is the assignee id for a row with no
 * assignee, so it needs no profile behind it.
 */
describe.each([
	{
		name: 'Missions',
		page: () => Missions,
		setFilters: { statuses: ['scheduled'], types: ['application'], people: ['unassigned'] },
		chips: 3,
	},
	{
		name: 'Assignments',
		page: () => Assignments,
		setFilters: { statuses: ['completed'], people: ['unassigned'] },
		chips: 2,
	},
])('$name', ({ page, setFilters, chips }) => {
	it('draws no chip bar on the default window with no set filter', () => {
		render(page(), {});

		expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
		expect(screen.queryByRole('button', { name: /^Remove Dates: / })).toBeNull();
	});

	it('draws the Dates chip and Clear all when only the window has moved', () => {
		render(page(), { from: movedFrom() });

		expect(dateChipRemover()).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Clear all' })).toBeTruthy();
	});

	// Both bounds are moved, the end to the open bound, so the case reads each
	// one being written back rather than one that never left the default.
	it('writes the schedule window back when the Dates chip is removed, keeping every set filter', () => {
		render(page(), { from: movedFrom(), to: 'any', ...setFilters });
		expect(screen.getAllByRole('button', { name: /^Remove .* filter$/ })).toHaveLength(chips + 1);

		act(() => {
			fireEvent.click(dateChipRemover());
		});

		const defaults = scheduleWindow();
		expect(url.search.from).toBe(defaults.from);
		expect(url.search.to).toBe(defaults.to);
		expect(url.search).toMatchObject(setFilters);
		expect(screen.queryByRole('button', { name: /^Remove Dates: / })).toBeNull();
		expect(screen.getAllByRole('button', { name: /^Remove .* filter$/ })).toHaveLength(chips);
		expect(screen.getByRole('button', { name: 'Clear all' })).toBeTruthy();
	});
});

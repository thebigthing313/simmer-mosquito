/** @vitest-environment jsdom */

/**
 * The Assignments status filter as a link spells it (#1466).
 *
 * `statuses` used to decode as an id set, so any string in the URL survived:
 * `?statuses=done` filtered the list down to nothing and drew a chip reading
 * `done`. It decodes against the assignment status vocabulary now, the way
 * Missions does, so an unknown member is dropped, and a link holding only
 * unknown members reads as no status filter at all.
 *
 * The router is `routerStandIn` answering `useSearch` from a variable. The
 * assignments hook hands back two rows, one completed and one not started, so
 * the unfiltered list and the filtered one differ. The split page renders its
 * children and the worklist map is nothing, since Mapbox GL has no jsdom.
 */

import { cleanup, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssignmentListing } from '../../../../../hooks/queries/assignment-view';
import { preloadRouteComponent, renderExplorer } from '../../explorer-route-harness';

const url = vi.hoisted(() => ({
	search: {} as Record<string, unknown>,
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../../route-mock-stand-ins');
	return routerStandIn(await importOriginal<object>(), () => url.search);
});

vi.mock('../../../../../hooks/use-auth-snapshot', async () => {
	const { authSnapshotStandIn } = await import('../refusal-harness');
	return authSnapshotStandIn();
});

vi.mock('../../../../../hooks/use-organization-time-zone', () => ({
	useOrganizationTimeZone: () => 'America/New_York',
}));

vi.mock('../../../../../hooks/explorer/use-personnel-options', () => ({
	usePersonnelOptions: () => ({ options: [], nameById: new Map() }),
}));

const ROWS = vi.hoisted((): readonly AssignmentListing[] => [
	{
		id: 'assignment-completed',
		assignmentName: 'North loop',
		assignmentDate: '2026-10-09',
		assignedToProfileId: null,
		dueAt: null,
		startedAt: new Date('2026-10-09T13:00:00Z'),
		completedAt: new Date('2026-10-09T18:00:00Z'),
		cancelledAt: null,
	},
	{
		id: 'assignment-not-started',
		assignmentName: 'South loop',
		assignmentDate: '2026-10-09',
		assignedToProfileId: null,
		dueAt: null,
		startedAt: null,
		completedAt: null,
		cancelledAt: null,
	},
]);

vi.mock('../../../../../hooks/queries/use-assignments', () => ({
	useAssignments: () => ({ assignments: ROWS, isLoading: false, isReady: true, isError: false }),
}));

vi.mock('../../../../../hooks/queries/use-assignment-item-counts', () => ({
	useAssignmentItemCounts: () => ({ countsById: new Map() }),
}));

vi.mock('../../../../../hooks/operations/use-assignment-stops', () => ({
	useAssignmentStops: () => ({
		stops: [],
		features: [],
		counts: { total: 0, completed: 0, skipped: 0, pending: 0, handled: 0 },
		isLoading: false,
	}),
}));

vi.mock('../../../../../components/app-shell/outlet/map-split-page', () => ({
	MapSplitPage: ({ children }: { readonly children?: ReactNode }) => <>{children}</>,
}));

vi.mock('../../../../../components/operations/worklist-map', () => ({
	WorklistMap: () => null,
}));

let Assignments: () => ReactNode;

beforeAll(async () => {
	Assignments = await preloadRouteComponent(
		() => import('../../../../../routes/operations/assignments/index'),
		'assignments index',
	);
}, 300_000);

beforeEach(() => {
	url.search = {};
});

afterEach(cleanup);

function render(search: Record<string, unknown>): void {
	url.search = search;
	renderExplorer(Assignments);
}

function listed(): string[] {
	return screen
		.queryAllByRole('button', { name: /^Show .* on the map$/ })
		.map((button) => button.getAttribute('aria-label') ?? '');
}

describe('the Assignments status filter', () => {
	it('drops a link holding only an unknown status and lists every assignment', () => {
		render({ statuses: ['done'] });

		expect(screen.queryByRole('button', { name: /^Remove .* filter$/ })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
		expect(screen.getByRole('button', { name: 'Filter by Status' }).textContent).toBe('Status');
		expect(listed()).toEqual(['Show North loop on the map', 'Show South loop on the map']);
	});

	it('keeps the known status beside an unknown one and draws one chip for it', () => {
		render({ statuses: ['completed', 'done'] });

		const chips = screen.getAllByRole('button', { name: /^Remove .* filter$/ });
		expect(chips.map((chip) => chip.getAttribute('aria-label'))).toEqual([
			'Remove Completed filter',
		]);
		expect(screen.getByRole('button', { name: 'Filter by Status' }).textContent).toBe('Status1');
		expect(listed()).toEqual(['Show North loop on the map']);
	});
});

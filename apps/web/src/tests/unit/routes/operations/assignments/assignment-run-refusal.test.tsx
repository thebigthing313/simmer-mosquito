/** @vitest-environment jsdom */

/**
 * What the assignment run page does with a refused lifecycle write.
 *
 * Start, Complete, Cancel and Reopen are buttons in the page's own header bar,
 * and the server refuses each on its preconditions: a Complete on an
 * assignment somebody else has already completed, a Start on one that has
 * been cancelled since the page loaded. The page used to hold that refusal in
 * a destructive `Alert` under the bar, and it was one of three pages under
 * operations doing so while every other record page reported one as a toast
 * (#1100). A refused start on a worklist is no more
 * correctable in place than a refused close from a record's menu, so it
 * follows the rule `DetailPageHeader`'s docblock carries, and what this
 * asserts is both halves: the toast is raised with the server's sentence, or
 * the page's fallback when the refusal carries none, and no `Alert` is drawn.
 *
 * What is faked is what `write-attribution.test.tsx` fakes for this route: the
 * `Route` hands back the params a match would, the role comes from a variable,
 * the split page renders its children and the worklist map is nothing, since
 * Mapbox GL has no jsdom. The assignment and its stops come from stand-ins for
 * the data hooks, and the mutation hook is a recorder whose refusal the case
 * chooses.
 */

import { cleanup, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProgressCounts } from '../../../../../hooks/queries/assignment-view';
import type { AssignmentView } from '../../../../../routes/operations/assignments/-assignment-data';
import { preloadRouteComponent } from '../../explorer-route-harness';
import {
	refusalHarness as harness,
	press,
	renderRefusalPage,
	resetRefusalHarness,
} from '../refusal-harness';

const page = vi.hoisted(() => ({
	/** The assignment the page is handed. */
	assignment: null as AssignmentView | null,
	/** Where the stops stand, which decides whether Start and Complete are enabled. */
	counts: { total: 0, completed: 0, skipped: 0, pending: 0, handled: 0 } as ProgressCounts,
}));

vi.mock('sonner', async () => {
	const { sonnerStandIn } = await import('../refusal-harness');
	return sonnerStandIn();
});

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { refusalRouterStandIn } = await import('../refusal-harness');
	return refusalRouterStandIn(await importOriginal<object>());
});

vi.mock('../../../../../hooks/use-auth-snapshot', async () => {
	const { authSnapshotStandIn } = await import('../refusal-harness');
	return authSnapshotStandIn();
});

vi.mock('../../../../../hooks/operations/use-assignment', () => ({
	useAssignment: () => ({
		assignment: page.assignment,
		isLoading: false,
		isReady: true,
		isError: false,
	}),
}));

vi.mock('../../../../../hooks/operations/use-assignment-stops', () => ({
	useAssignmentStops: () => ({
		stops: [],
		features: [],
		counts: page.counts,
		isLoading: false,
	}),
}));

vi.mock('../../../../../hooks/operations/use-assignee-options', () => ({
	useAssigneeOptions: () => ({ options: [], nameById: new Map<string, string>() }),
}));

vi.mock('../../../../../hooks/mutations/use-assignment-mutations', async () => {
	const { lifecycleWrite } = await import('../refusal-harness');
	return {
		useAssignmentMutations: () => ({
			start: lifecycleWrite('start'),
			complete: lifecycleWrite('complete'),
			cancel: lifecycleWrite('cancel'),
			reopen: lifecycleWrite('reopen'),
			canWrite: true,
		}),
	};
});

vi.mock('../../../../../hooks/mutations/use-assignment-item-mutations', () => ({
	useAssignmentItemMutations: () => ({ canWrite: true }),
}));

vi.mock('../../../../../hooks/mutations/use-collection-mutations', () => ({
	useCollectionMutations: () => ({ canWrite: true }),
}));

vi.mock('../../../../../components/app-shell/outlet/map-split-page', () => ({
	MapSplitPage: ({ children }: { readonly children?: ReactNode }) => <>{children}</>,
}));

vi.mock('../../../../../routes/operations/-worklist-map', () => ({
	WorklistMap: () => null,
}));

vi.mock('../../../../../components/comments-section', () => ({
	CommentsSection: () => <p>comments</p>,
}));

let AssignmentRun: () => ReactNode;

beforeAll(async () => {
	AssignmentRun = await preloadRouteComponent(
		() => import('../../../../../routes/operations/assignments/$id'),
		'assignment run',
	);
}, 300_000);

beforeEach(() => {
	resetRefusalHarness();
	page.counts = { total: 0, completed: 0, skipped: 0, pending: 0, handled: 0 };
});

afterEach(cleanup);

function assignment(overrides: Partial<AssignmentView> = {}): AssignmentView {
	return {
		id: harness.params.id as string,
		assignmentName: 'North loop',
		assignmentDate: '2026-08-04',
		assignedToProfileId: null,
		dueAt: null,
		startedAt: null,
		completedAt: null,
		cancelledAt: null,
		cancellationReason: null,
		status: 'notStarted',
		...overrides,
	};
}

async function renderPage(record: AssignmentView) {
	page.assignment = record;
	await renderRefusalPage(AssignmentRun, 'North loop');
}

describe('a refused lifecycle write on the assignment run page', () => {
	it('is a toast carrying the server sentence, and no Alert', async () => {
		// A refusal the browser cannot pre-empt: `canCompleteAssignment` already
		// disables Complete over a pending stop, so the server's answer here is
		// one about a race the counts on screen do not show.
		harness.refusal = new Error('This assignment has already been completed.');
		page.counts = { total: 2, completed: 2, skipped: 0, pending: 0, handled: 2 };
		await renderPage(assignment({ status: 'inProgress', startedAt: new Date('2026-08-04') }));

		await press('Complete');

		await waitFor(() => expect(harness.writes).toEqual(['complete']));
		await waitFor(() =>
			expect(harness.toastError).toHaveBeenCalledWith(
				'This assignment has already been completed.',
			),
		);
		expect(screen.queryByRole('alert')).toBeNull();
		expect(screen.queryByText('This assignment has already been completed.')).toBeNull();
	});

	it('falls back to the page sentence when the refusal carries none', async () => {
		harness.refusal = 'refused';
		page.counts = { total: 1, completed: 0, skipped: 0, pending: 1, handled: 0 };
		await renderPage(assignment());

		await press('Start');

		await waitFor(() => expect(harness.writes).toEqual(['start']));
		await waitFor(() =>
			expect(harness.toastError).toHaveBeenCalledWith('Unable to start this assignment.'),
		);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('raises no toast when the write goes through', async () => {
		page.counts = { total: 1, completed: 0, skipped: 0, pending: 1, handled: 0 };
		await renderPage(assignment());

		await press('Start');

		await waitFor(() => expect(harness.writes).toEqual(['start']));
		expect(harness.toastError).not.toHaveBeenCalled();
		expect(screen.queryByRole('alert')).toBeNull();
	});
});

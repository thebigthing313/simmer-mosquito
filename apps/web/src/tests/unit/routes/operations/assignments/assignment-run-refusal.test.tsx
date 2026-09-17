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

import type { SimmerRole } from '@simmer-mosquito/domain';
import { TooltipProvider } from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, Suspense } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProgressCounts } from '../../../../../hooks/queries/assignment-view';
import { organizations } from '../../../../../lib/collections/organizations';
import type { AssignmentView } from '../../../../../routes/operations/assignments/-assignment-data';
import { installMemoryCollections, seedRows } from '../../../lib/collections/memory-collections';
import { preloadRouteComponent } from '../../explorer-route-harness';

type LifecycleWrite = 'start' | 'complete' | 'cancel' | 'reopen';

const harness = vi.hoisted(() => ({
	params: { id: 'assignment-1' } as Record<string, string>,
	role: 'manager' as SimmerRole,
	/** The assignment the page is handed. */
	assignment: null as AssignmentView | null,
	/** Where the stops stand, which decides whether Start and Complete are enabled. */
	counts: { total: 0, completed: 0, skipped: 0, pending: 0, handled: 0 } as ProgressCounts,
	/** What the server answers the next lifecycle write with; `null` is a success. */
	refusal: null as Error | string | null,
	/** Every lifecycle write the page asked for, in order. */
	writes: [] as LifecycleWrite[],
	toastError: vi.fn(),
}));

vi.mock('sonner', () => ({
	toast: { error: (message: string) => harness.toastError(message) },
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
	const { routerStandIn } = await import('../../route-mock-stand-ins');
	return routerStandIn(
		await importOriginal<object>(),
		() => ({}),
		() => harness.params,
	);
});

vi.mock('../../../../../hooks/use-auth-snapshot', async () => {
	const { signedInSnapshotAs } = await import('../../route-mock-stand-ins');
	return { useAuthSnapshot: () => signedInSnapshotAs(harness.role) };
});

vi.mock(
	'../../../../../routes/operations/assignments/-assignment-data',
	async (importOriginal) => ({
		...(await importOriginal<
			typeof import('../../../../../routes/operations/assignments/-assignment-data')
		>()),
		useAssignment: () => ({
			assignment: harness.assignment,
			isLoading: false,
			isReady: true,
			isError: false,
		}),
		useAssignmentStops: () => ({
			stops: [],
			features: [],
			counts: harness.counts,
			isLoading: false,
		}),
		useAssigneeOptions: () => ({ options: [], nameById: new Map<string, string>() }),
	}),
);

vi.mock('../../../../../hooks/mutations/use-assignment-mutations', () => {
	const write = (kind: LifecycleWrite) => async () => {
		harness.writes.push(kind);
		if (harness.refusal !== null) {
			throw harness.refusal;
		}
	};
	return {
		useAssignmentMutations: () => ({
			start: write('start'),
			complete: write('complete'),
			cancel: write('cancel'),
			reopen: write('reopen'),
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
	installMemoryCollections();
	seedRows(organizations, [{ id: 'org-1', name: 'Test Mosquito Control', settings: {} }]);
	harness.role = 'manager';
	harness.refusal = null;
	harness.writes.length = 0;
	harness.counts = { total: 0, completed: 0, skipped: 0, pending: 0, handled: 0 };
	harness.toastError.mockReset();
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
	harness.assignment = record;
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<TooltipProvider>
				<Suspense fallback={<span>loading</span>}>
					<AssignmentRun />
				</Suspense>
			</TooltipProvider>
		</QueryClientProvider>,
	);
	await screen.findByRole('heading', { level: 1, name: 'North loop' });
}

/** Press a lifecycle button and let the write settle, so the busy flag clears inside `act`. */
async function press(name: string): Promise<void> {
	const button = screen.getByRole('button', { name });
	expect((button as HTMLButtonElement).disabled).toBe(false);
	await act(async () => {
		fireEvent.click(button);
	});
}

describe('a refused lifecycle write on the assignment run page', () => {
	it('is a toast carrying the server sentence, and no Alert', async () => {
		// A refusal the browser cannot pre-empt: `canCompleteAssignment` already
		// disables Complete over a pending stop, so the server's answer here is
		// one about a race the counts on screen do not show.
		harness.refusal = new Error('This assignment has already been completed.');
		harness.counts = { total: 2, completed: 2, skipped: 0, pending: 0, handled: 2 };
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
		harness.counts = { total: 1, completed: 0, skipped: 0, pending: 1, handled: 0 };
		await renderPage(assignment());

		await press('Start');

		await waitFor(() => expect(harness.writes).toEqual(['start']));
		await waitFor(() =>
			expect(harness.toastError).toHaveBeenCalledWith('Unable to start this assignment.'),
		);
		expect(screen.queryByRole('alert')).toBeNull();
	});

	it('raises no toast when the write goes through', async () => {
		harness.counts = { total: 1, completed: 0, skipped: 0, pending: 1, handled: 0 };
		await renderPage(assignment());

		await press('Start');

		await waitFor(() => expect(harness.writes).toEqual(['start']));
		expect(harness.toastError).not.toHaveBeenCalled();
		expect(screen.queryByRole('alert')).toBeNull();
	});
});

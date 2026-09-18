/** @vitest-environment jsdom */

/**
 * What the mission page does with a refused lifecycle write.
 *
 * Start, Complete, Cancel and Reopen sit in the page's own header, and the
 * server refuses each on its preconditions: a Complete on a mission whose
 * stops were reopened from another device, a Start on one cancelled since the
 * page loaded. The page was one of the three under operations that used to
 * hold a refusal in a destructive `Alert` (#1100), and it reaches the same
 * `useCommandRunner` as the other two through `useMissionRun`, whose four
 * lifecycle actions each pass a fallback sentence. Only the hook's own suite
 * covered that; nothing rendered the route and pressed the buttons. So this
 * asserts both halves of the rule `DetailPageHeader`'s docblock carries, per
 * action: the toast is raised with the server's sentence, or the page's
 * fallback when the refusal carries none, and no `Alert` is drawn.
 *
 * Cancel and Reopen are two presses, because each opens a `ReasonDialog` and
 * the write is the dialog's confirm. The reason is optional on both, so the
 * case confirms with the box empty and the hook sends the plain fact.
 *
 * What is faked is what `assignment-run-refusal.test.tsx` fakes for its
 * route: the `Route` hands back the params a match would, the role comes from
 * a variable, the split page renders its children and the worklist map is
 * nothing, since Mapbox GL has no jsdom. The mission and its stop counts come
 * from stand-ins for the data hooks, and the mutation hook is a recorder whose
 * refusal the case chooses. The notifications card and the comments column
 * are stand-ins because neither is in the question.
 */

import type { SimmerRole } from '@simmer-mosquito/domain';
import { TooltipProvider } from '@simmer-mosquito/ui-web/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactNode, Suspense } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MissionProgressCounts } from '../../../../../hooks/queries/operations-view';
import type { MissionRecord } from '../../../../../hooks/queries/use-mission';
import { organizations } from '../../../../../lib/collections/organizations';
import { installMemoryCollections, seedRows } from '../../../lib/collections/memory-collections';
import { preloadRouteComponent } from '../../explorer-route-harness';

type LifecycleWrite = 'start' | 'complete' | 'cancel' | 'reopen';

const harness = vi.hoisted(() => ({
	params: { id: 'mission-1' } as Record<string, string>,
	role: 'manager' as SimmerRole,
	/** The mission the page is handed. */
	mission: null as MissionRecord | null,
	/** Where the stops stand, which decides whether Start and Complete are enabled. */
	counts: { total: 0, completed: 0, skipped: 0, pending: 0, handled: 0 } as MissionProgressCounts,
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

vi.mock('../../../../../hooks/queries/use-mission', () => ({
	useMission: () => ({
		mission: harness.mission ?? undefined,
		isReady: true,
		isError: false,
	}),
}));

vi.mock('../../../../../routes/operations/-operations-data', async (importOriginal) => ({
	...(await importOriginal<typeof import('../../../../../routes/operations/-operations-data')>()),
	useMissionStopViews: () => ({
		stops: [],
		counts: harness.counts,
		isLoading: false,
	}),
}));

vi.mock('../../../../../hooks/mutations/use-mission-mutations', () => {
	const write = (kind: LifecycleWrite) => async () => {
		harness.writes.push(kind);
		if (harness.refusal !== null) {
			throw harness.refusal;
		}
	};
	return {
		useMissionMutations: () => ({
			start: write('start'),
			complete: write('complete'),
			cancel: write('cancel'),
			reopen: write('reopen'),
			remove: async () => {},
			moveStops: async () => {},
			canWrite: true,
		}),
	};
});

vi.mock('../../../../../hooks/mutations/use-mission-item-mutations', () => ({
	useMissionItemMutations: () => ({ canWrite: true }),
}));

vi.mock('../../../../../components/app-shell/outlet/map-split-page', () => ({
	MapSplitPage: ({ children }: { readonly children?: ReactNode }) => <>{children}</>,
}));

vi.mock('../../../../../routes/operations/-worklist-map', () => ({
	WorklistMap: () => null,
}));

vi.mock('../../../../../routes/operations/missions/-mission-notifications-card', () => ({
	MissionNotificationsCard: () => <p>notifications</p>,
}));

vi.mock('../../../../../components/comments-section', () => ({
	CommentsSection: () => <p>comments</p>,
}));

let MissionDetail: () => ReactNode;

beforeAll(async () => {
	MissionDetail = await preloadRouteComponent(
		() => import('../../../../../routes/operations/missions/$id'),
		'mission detail',
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

function mission(overrides: Partial<MissionRecord> = {}): MissionRecord {
	const scheduledStartAt = new Date('2026-08-04T11:00:00Z');
	return {
		id: harness.params.id as string,
		organizationId: 'org-1',
		missionName: 'Fog run',
		controlType: 'application',
		plannedMethodId: null,
		assignedToProfileId: null,
		assignedByProfileId: null,
		scheduledStartAt,
		scheduledEndAt: null,
		rainDate: null,
		startedAt: null,
		completedAt: null,
		cancelledAt: null,
		cancellationReason: null,
		notificationTypeId: null,
		createdAt: scheduledStartAt,
		updatedAt: scheduledStartAt,
		status: 'scheduled',
		...overrides,
	};
}

/** A mission that is running, with every stop handled, so Complete is enabled. */
function runningMission(): MissionRecord {
	harness.counts = { total: 2, completed: 2, skipped: 0, pending: 0, handled: 2 };
	return mission({ status: 'inProgress', startedAt: new Date('2026-08-04T11:05:00Z') });
}

/** A mission that has ended, so the header offers Reopen and nothing else. */
function completedMission(): MissionRecord {
	harness.counts = { total: 2, completed: 2, skipped: 0, pending: 0, handled: 2 };
	return mission({
		status: 'completed',
		startedAt: new Date('2026-08-04T11:05:00Z'),
		completedAt: new Date('2026-08-04T13:00:00Z'),
	});
}

async function renderPage(record: MissionRecord) {
	harness.mission = record;
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	render(
		<QueryClientProvider client={client}>
			<TooltipProvider>
				<Suspense fallback={<span>loading</span>}>
					<MissionDetail />
				</Suspense>
			</TooltipProvider>
		</QueryClientProvider>,
	);
	await screen.findByRole('heading', { level: 1, name: 'Fog run' });
}

/** Press a lifecycle button and let the write settle, so the busy flag clears inside `act`. */
async function press(name: string): Promise<void> {
	const button = screen.getByRole('button', { name });
	expect((button as HTMLButtonElement).disabled).toBe(false);
	await act(async () => {
		fireEvent.click(button);
	});
}

/**
 * Press a header button that opens a `ReasonDialog`, then its confirm. The
 * confirm is found rather than pressed straight away, because the dialog
 * mounts its content on open.
 */
async function pressThroughDialog(name: string, confirmLabel: string): Promise<void> {
	await press(name);
	const confirm = await screen.findByRole('button', { name: confirmLabel });
	expect((confirm as HTMLButtonElement).disabled).toBe(false);
	await act(async () => {
		fireEvent.click(confirm);
	});
}

/** The two halves of the rule: the toast says `message`, and nothing on the page does. */
async function expectRefusalToast(message: string): Promise<void> {
	await waitFor(() => expect(harness.toastError).toHaveBeenCalledWith(message));
	expect(harness.toastError).toHaveBeenCalledTimes(1);
	expect(screen.queryByRole('alert')).toBeNull();
	expect(screen.queryByText(message)).toBeNull();
}

describe('a refused lifecycle write on the mission page', () => {
	describe('Start', () => {
		it('is a toast carrying the server sentence, and no Alert', async () => {
			harness.refusal = new Error('This mission has been cancelled.');
			harness.counts = { total: 1, completed: 0, skipped: 0, pending: 1, handled: 0 };
			await renderPage(mission());

			await press('Start');

			await waitFor(() => expect(harness.writes).toEqual(['start']));
			await expectRefusalToast('This mission has been cancelled.');
		});

		it('falls back to the page sentence when the refusal carries none', async () => {
			harness.refusal = 'refused';
			harness.counts = { total: 1, completed: 0, skipped: 0, pending: 1, handled: 0 };
			await renderPage(mission());

			await press('Start');

			await waitFor(() => expect(harness.writes).toEqual(['start']));
			await expectRefusalToast('Unable to start this mission.');
		});
	});

	describe('Complete', () => {
		it('is a toast carrying the server sentence, and no Alert', async () => {
			// A refusal the browser cannot pre-empt: `canCompleteMission` already
			// disables Complete over a pending stop, so the server's answer here is
			// about a stop reopened since the counts on screen were read.
			harness.refusal = new Error('Some stops are still pending.');
			await renderPage(runningMission());

			await press('Complete');

			await waitFor(() => expect(harness.writes).toEqual(['complete']));
			await expectRefusalToast('Some stops are still pending.');
		});

		it('falls back to the page sentence when the refusal carries none', async () => {
			harness.refusal = 'refused';
			await renderPage(runningMission());

			await press('Complete');

			await waitFor(() => expect(harness.writes).toEqual(['complete']));
			await expectRefusalToast('Unable to complete this mission.');
		});
	});

	describe('Cancel', () => {
		it('is a toast carrying the server sentence, and no Alert', async () => {
			harness.refusal = new Error('This mission has already been completed.');
			await renderPage(runningMission());

			await pressThroughDialog('Cancel', 'Cancel Mission');

			await waitFor(() => expect(harness.writes).toEqual(['cancel']));
			await expectRefusalToast('This mission has already been completed.');
		});

		it('falls back to the page sentence when the refusal carries none', async () => {
			harness.refusal = 'refused';
			await renderPage(mission());

			await pressThroughDialog('Cancel', 'Cancel Mission');

			await waitFor(() => expect(harness.writes).toEqual(['cancel']));
			await expectRefusalToast('Unable to cancel this mission.');
		});
	});

	describe('Reopen', () => {
		it('is a toast carrying the server sentence, and no Alert', async () => {
			harness.refusal = new Error('This mission is already in progress.');
			await renderPage(completedMission());

			await pressThroughDialog('Reopen', 'Reopen Mission');

			await waitFor(() => expect(harness.writes).toEqual(['reopen']));
			await expectRefusalToast('This mission is already in progress.');
		});

		it('falls back to the page sentence when the refusal carries none', async () => {
			harness.refusal = 'refused';
			await renderPage(completedMission());

			await pressThroughDialog('Reopen', 'Reopen Mission');

			await waitFor(() => expect(harness.writes).toEqual(['reopen']));
			await expectRefusalToast('Unable to reopen this mission.');
		});
	});

	it('raises no toast when the write goes through', async () => {
		harness.counts = { total: 1, completed: 0, skipped: 0, pending: 1, handled: 0 };
		await renderPage(mission());

		await press('Start');

		await waitFor(() => expect(harness.writes).toEqual(['start']));
		expect(harness.toastError).not.toHaveBeenCalled();
		expect(screen.queryByRole('alert')).toBeNull();
	});
});

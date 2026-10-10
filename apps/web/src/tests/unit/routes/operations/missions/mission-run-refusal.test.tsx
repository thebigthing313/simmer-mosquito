/** @vitest-environment jsdom */

/**
 * What the mission page does with a refused lifecycle write, and the header
 * those writes are chosen from.
 *
 * Start, Complete, Cancel and Reopen are items in the `...` of the shared
 * `DetailPageHeader` (#1267), and the server refuses each on its preconditions: a Complete on a mission whose
 * stops were reopened from another device, a Start on one cancelled since the
 * page loaded. The page was one of the three under operations that used to
 * hold a refusal in a destructive `Alert` (#1100), and it reaches the same
 * `useCommandRunner` as the other two through `useMissionRun`, whose four
 * lifecycle actions each pass a fallback sentence. Only the hook's own suite
 * covered that; nothing rendered the route and chose the commands. So this
 * asserts both halves of the rule `DetailPageHeader`'s docblock carries, per
 * action: the toast is raised with the server's sentence, or the page's
 * fallback when the refusal carries none, and no `Alert` is drawn.
 *
 * Cancel and Reopen are two choices, because each opens a `ReasonDialog` and
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
 *
 * The second half is the header itself: which items the `...` holds per state
 * and per role, that Start and Complete stay in it disabled when their
 * preconditions fail, that Delete is last and leaves the page on Mission Not
 * Found, and that the back link, the button row and the danger-zone card are
 * gone. A
 * delete the server answers with a question asks it from Mission Not Found,
 * because the header that opened the delete has gone with the row (#1299).
 *
 * Then the rail under the header (#1268): Stops, Comments and Notifications,
 * with the notifications inside their tab and nowhere below it. The last is
 * Mission Not Found itself: its title, and the link back to the index, whose
 * `href` the stand-in `Link` writes out.
 */

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MissionProgressCounts } from '../../../../../hooks/queries/operations-view';
import type { MissionRecord } from '../../../../../hooks/queries/use-mission';
import { recordNoun } from '../../../../../lib/record-nouns';
import { preloadRouteComponent } from '../../explorer-route-harness';
import {
	acknowledgementRefusal,
	choose,
	chooseDelete,
	chooseThroughDialog,
	expectRefusalToast,
	refusalHarness as harness,
	ORGANIZATION_ID,
	openMenu,
	renderRefusalPage,
	resetRefusalHarness,
} from '../refusal-harness';

const page = vi.hoisted(() => ({
	/** The mission the page is handed. */
	mission: null as MissionRecord | null,
	/** Where the stops stand, which decides whether Start and Complete are enabled. */
	counts: { total: 0, completed: 0, skipped: 0, pending: 0, handled: 0 } as MissionProgressCounts,
	/** What redraws when the mission is taken away. */
	listeners: new Set<() => void>(),
	/** The flags each delete carried, in order. */
	removals: [] as Readonly<Record<string, boolean>>[],
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

// Read through a store so a delete that takes the row away redraws the page,
// the way the collection does for the real hook.
vi.mock('../../../../../hooks/queries/use-mission', async () => {
	const { useSyncExternalStore } = await import('react');
	const subscribe = (listener: () => void) => {
		page.listeners.add(listener);
		return () => page.listeners.delete(listener);
	};
	return {
		useMission: () => ({
			mission: useSyncExternalStore(subscribe, () => page.mission) ?? undefined,
			isReady: true,
			isError: false,
		}),
	};
});

vi.mock('../../../../../hooks/operations/use-mission-stop-views', () => ({
	useMissionStopViews: () => ({
		stops: [],
		counts: page.counts,
		isLoading: false,
	}),
}));

vi.mock('../../../../../hooks/mutations/use-mission-mutations', async () => {
	const { lifecycleWrite } = await import('../refusal-harness');
	const recordRemove = lifecycleWrite('remove');
	return {
		useMissionMutations: () => ({
			start: lifecycleWrite('start'),
			complete: lifecycleWrite('complete'),
			cancel: lifecycleWrite('cancel'),
			reopen: lifecycleWrite('reopen'),
			// The real delete is optimistic, so the row leaves the collection the
			// moment it is confirmed and before the server answers; the stand-in
			// takes it off the page the same way, and leaves it off on a refusal.
			remove: async (_id: string, acknowledgements: Readonly<Record<string, boolean>> = {}) => {
				page.removals.push(acknowledgements);
				page.mission = null;
				for (const listener of page.listeners) {
					listener();
				}
				await recordRemove();
			},
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

vi.mock('../../../../../components/map/stop-sequence-map', () => ({
	StopSequenceMap: () => null,
}));

vi.mock('../../../../../components/operations/missions/mission-notifications-card', () => ({
	MissionNotificationsCard: () => <p>notifications</p>,
	MissionNotificationCount: () => <span>3</span>,
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
	resetRefusalHarness();
	page.counts = { total: 0, completed: 0, skipped: 0, pending: 0, handled: 0 };
	page.removals.length = 0;
});

afterEach(cleanup);

function mission(overrides: Partial<MissionRecord> = {}): MissionRecord {
	const scheduledStartAt = new Date('2026-08-04T11:00:00Z');
	return {
		id: harness.params.id as string,
		organizationId: ORGANIZATION_ID,
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
	page.counts = { total: 2, completed: 2, skipped: 0, pending: 0, handled: 2 };
	return mission({ status: 'inProgress', startedAt: new Date('2026-08-04T11:05:00Z') });
}

/** A mission that has ended, so the header offers Reopen and nothing else. */
function completedMission(): MissionRecord {
	page.counts = { total: 2, completed: 2, skipped: 0, pending: 0, handled: 2 };
	return mission({
		status: 'completed',
		startedAt: new Date('2026-08-04T11:05:00Z'),
		completedAt: new Date('2026-08-04T13:00:00Z'),
	});
}

async function renderPage(record: MissionRecord) {
	page.mission = record;
	await renderRefusalPage(MissionDetail, 'Fog run');
}

describe('a refused lifecycle write on the mission page', () => {
	describe('Start', () => {
		it('is a toast carrying the server sentence, and no Alert', async () => {
			harness.refusal = new Error('This mission has been cancelled.');
			page.counts = { total: 1, completed: 0, skipped: 0, pending: 1, handled: 0 };
			await renderPage(mission());

			await choose('Start Mission');

			await waitFor(() => expect(harness.writes).toEqual(['start']));
			await expectRefusalToast('This mission has been cancelled.');
		});

		it('falls back to the page sentence when the refusal carries none', async () => {
			harness.refusal = 'refused';
			page.counts = { total: 1, completed: 0, skipped: 0, pending: 1, handled: 0 };
			await renderPage(mission());

			await choose('Start Mission');

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

			await choose('Complete Mission');

			await waitFor(() => expect(harness.writes).toEqual(['complete']));
			await expectRefusalToast('Some stops are still pending.');
		});

		it('falls back to the page sentence when the refusal carries none', async () => {
			harness.refusal = 'refused';
			await renderPage(runningMission());

			await choose('Complete Mission');

			await waitFor(() => expect(harness.writes).toEqual(['complete']));
			await expectRefusalToast('Unable to complete this mission.');
		});
	});

	describe('Cancel', () => {
		it('is a toast carrying the server sentence, and no Alert', async () => {
			harness.refusal = new Error('This mission has already been completed.');
			await renderPage(runningMission());

			await chooseThroughDialog('Cancel Mission', 'Cancel Mission');

			await waitFor(() => expect(harness.writes).toEqual(['cancel']));
			await expectRefusalToast('This mission has already been completed.');
		});

		it('falls back to the page sentence when the refusal carries none', async () => {
			harness.refusal = 'refused';
			await renderPage(mission());

			await chooseThroughDialog('Cancel Mission', 'Cancel Mission');

			await waitFor(() => expect(harness.writes).toEqual(['cancel']));
			await expectRefusalToast('Unable to cancel this mission.');
		});
	});

	describe('Reopen', () => {
		it('is a toast carrying the server sentence, and no Alert', async () => {
			harness.refusal = new Error('This mission is already in progress.');
			await renderPage(completedMission());

			await chooseThroughDialog('Reopen Mission', 'Reopen Mission');

			await waitFor(() => expect(harness.writes).toEqual(['reopen']));
			await expectRefusalToast('This mission is already in progress.');
		});

		it('falls back to the page sentence when the refusal carries none', async () => {
			harness.refusal = 'refused';
			await renderPage(completedMission());

			await chooseThroughDialog('Reopen Mission', 'Reopen Mission');

			await waitFor(() => expect(harness.writes).toEqual(['reopen']));
			await expectRefusalToast('Unable to reopen this mission.');
		});
	});

	it('raises no toast when the write goes through', async () => {
		page.counts = { total: 1, completed: 0, skipped: 0, pending: 1, handled: 0 };
		await renderPage(mission());

		await choose('Start Mission');

		await waitFor(() => expect(harness.writes).toEqual(['start']));
		expect(harness.toastError).not.toHaveBeenCalled();
		expect(screen.queryByRole('alert')).toBeNull();
	});
});

describe('the mission page header', () => {
	it('draws the shared bar and none of the controls it replaced', async () => {
		page.counts = { total: 1, completed: 0, skipped: 0, pending: 1, handled: 0 };
		await renderPage(mission());

		expect(screen.getByRole('banner').getAttribute('data-frame')).toBe('panel');
		expect(screen.getByText(recordNoun('mission').title)).toBeTruthy();
		expect(screen.getByText('Scheduled')).toBeTruthy();
		// The stand-in `Link` is an anchor, so the pencil is found by its name.
		expect(screen.getByLabelText('Edit')).toBeTruthy();
		expect(screen.queryByRole('link', { name: recordNoun('mission').titleMany })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
		expect(screen.queryByText(/Delete This/)).toBeNull();
	});

	it('offers Start and Cancel on a scheduled mission, with Delete last', async () => {
		page.counts = { total: 1, completed: 0, skipped: 0, pending: 1, handled: 0 };
		await renderPage(mission());

		expect(await openMenu()).toEqual(['Start Mission', 'Cancel Mission', 'Delete mission']);
		expect(screen.getByRole('separator')).toBeTruthy();
	});

	it('offers Complete and Cancel on a running mission', async () => {
		await renderPage(runningMission());

		expect(await openMenu()).toEqual(['Complete Mission', 'Cancel Mission', 'Delete mission']);
	});

	it('offers Reopen on a mission that has ended', async () => {
		await renderPage(completedMission());

		expect(await openMenu()).toEqual(['Reopen Mission', 'Delete mission']);
	});

	// Disabled rather than hidden: the counts under the bar say why, and a
	// missing item would say nothing at all.
	it('keeps Start in the menu, disabled, on a mission with no stops', async () => {
		await renderPage(mission());

		await openMenu();
		const start = screen.getByRole('menuitem', { name: 'Start Mission' });
		expect(start.getAttribute('aria-disabled')).toBe('true');
	});

	it('keeps Complete in the menu, disabled, while a stop is pending', async () => {
		page.counts = { total: 2, completed: 1, skipped: 0, pending: 1, handled: 1 };
		await renderPage(
			mission({ status: 'inProgress', startedAt: new Date('2026-08-04T11:05:00Z') }),
		);

		expect(screen.getByText('1 stop still pending')).toBeTruthy();
		await openMenu();
		const complete = screen.getByRole('menuitem', { name: 'Complete Mission' });
		expect(complete.getAttribute('aria-disabled')).toBe('true');
	});

	it('leaves a Collector the progress command and nothing a manager holds', async () => {
		harness.role = 'collector';
		await renderPage(runningMission());

		expect(screen.queryByLabelText('Edit')).toBeNull();
		expect(await openMenu()).toEqual(['Complete Mission']);
	});

	it('draws no menu for a Collector on a mission that has ended', async () => {
		harness.role = 'collector';
		await renderPage(completedMission());

		expect(screen.queryByRole('button', { name: 'More Actions' })).toBeNull();
	});

	it('draws no menu for a Viewer', async () => {
		harness.role = 'viewer';
		await renderPage(runningMission());

		expect(screen.queryByLabelText('Edit')).toBeNull();
		expect(screen.queryByRole('button', { name: 'More Actions' })).toBeNull();
	});

	it('deletes the mission from the last item and lands on Mission Not Found', async () => {
		page.counts = { total: 1, completed: 0, skipped: 0, pending: 1, handled: 0 };
		await renderPage(mission());

		await chooseDelete('Delete mission', 'Delete Fog run?', 'Delete Mission');

		await waitFor(() => expect(harness.writes).toEqual(['remove']));
		expect(await screen.findByText('Mission Not Found')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Back to Missions' })).toBeTruthy();
	});

	// The route holds the delete's runner above the panel for this (#1267): the
	// row goes the moment the delete is confirmed, the header and its dialog
	// unmount with it, and the question the refusal asks has to be drawn from
	// the page that is left.
	it('asks the refusal question from Mission Not Found, and resends with the flag', async () => {
		harness.refusal = acknowledgementRefusal('acknowledgedMissionItemDeletion');
		page.counts = { total: 1, completed: 0, skipped: 0, pending: 1, handled: 0 };
		await renderPage(mission());

		await chooseDelete('Delete mission', 'Delete Fog run?', 'Delete Mission');

		expect(await screen.findByRole('dialog', { name: 'Delete the stops?' })).toBeTruthy();
		expect(screen.getByText('Mission Not Found')).toBeTruthy();
		expect(harness.toastError).not.toHaveBeenCalled();

		harness.refusal = null;
		fireEvent.click(screen.getByRole('button', { name: 'Delete them' }));

		await waitFor(() => expect(harness.writes).toEqual(['remove', 'remove']));
		const withheld = {
			acknowledgedActualActionDetach: false,
			acknowledgedMissionItemDeletion: false,
			acknowledgedNotificationDeletion: false,
		};
		expect(page.removals).toEqual([
			withheld,
			{ ...withheld, acknowledgedMissionItemDeletion: true },
		]);
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(harness.toastError).not.toHaveBeenCalled();
	});
});

describe('Mission Not Found', () => {
	it('draws the title and a link back to the Missions index', async () => {
		page.mission = null;
		await renderRefusalPage(MissionDetail, { text: 'Mission Not Found' });

		const back = screen.getByRole('link', { name: 'Back to Missions' });
		expect(back.getAttribute('href')).toBe('/operations/missions');
		expect(screen.queryByRole('button', { name: 'More Actions' })).toBeNull();
	});
});

describe('the mission page rail', () => {
	it('draws Stops, Comments and Notifications, and opens on Stops', async () => {
		await renderPage(mission());

		expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
			'Stops',
			'Comments',
			'Notifications3',
		]);
		expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Stops');
	});

	it('draws the notifications inside their tab and nowhere below it', async () => {
		await renderPage(mission());

		expect(screen.queryByText('notifications')).toBeNull();

		// Radix switches a tab on the mouse-down half of a click.
		fireEvent.mouseDown(screen.getByRole('tab', { name: /^Notifications/ }), { button: 0 });

		const card = screen.getByText('notifications');
		expect(card.closest('[role="tabpanel"]')).not.toBeNull();
	});
});

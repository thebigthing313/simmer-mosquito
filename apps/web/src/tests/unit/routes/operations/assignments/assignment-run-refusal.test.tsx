/** @vitest-environment jsdom */

/**
 * What the assignment run page does with a refused lifecycle write, and the
 * header those writes are chosen from.
 *
 * Start, Complete, Cancel and Reopen are items in the `...` of the shared
 * `DetailPageHeader` (#1269), and the server refuses each on its
 * preconditions: a Complete on an assignment somebody else has already
 * completed, a Start on one that has been cancelled since the page loaded. The
 * page used to hold that refusal in a destructive `Alert` under the bar, and
 * it was one of three pages under operations doing so while every other record
 * page reported one as a toast (#1100). So this asserts both halves of the
 * rule `DetailPageHeader`'s docblock carries, per action: the toast is raised
 * with the server's sentence, or the page's fallback when the refusal carries
 * none, and no `Alert` is drawn.
 *
 * Cancel opens a `ReasonDialog` and the write is the dialog's confirm; the
 * reason is optional, so the case confirms with the box empty. Reopen takes no
 * reason on an assignment, because `fieldWork.reopenAssignment` carries none,
 * so choosing it is the write.
 *
 * What is faked is what `write-attribution.test.tsx` fakes for this route: the
 * `Route` hands back the params a match would, the role comes from a variable,
 * the split page renders its children and the worklist map is nothing, since
 * Mapbox GL has no jsdom. The assignment and its stops come from stand-ins for
 * the data hooks, and the mutation hook is a recorder whose refusal the case
 * chooses.
 *
 * The second half is the header itself: which items the `...` holds per state
 * and per role, that Start and Complete stay in it disabled when their
 * preconditions fail, that Delete is last and leaves the page on Assignment
 * Not Found, and that the back link and the button row are gone. A delete the
 * server answers with a question asks it from Assignment Not Found, because
 * the header that opened the delete has gone with the row (#1299).
 *
 * The last is Assignment Not Found itself: its title, and the link back to the
 * index, whose `href` the stand-in `Link` writes out.
 */

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssignmentView } from '../../../../../components/operations/assignments/assignment-data';
import type { ProgressCounts } from '../../../../../hooks/queries/assignment-view';
import { recordNoun } from '../../../../../lib/record-nouns';
import { preloadRouteComponent } from '../../explorer-route-harness';
import {
	acknowledgementRefusal,
	choose,
	chooseDelete,
	chooseThroughDialog,
	expectRefusalToast,
	refusalHarness as harness,
	openMenu,
	renderRefusalPage,
	resetRefusalHarness,
} from '../refusal-harness';

const page = vi.hoisted(() => ({
	/** The assignment the page is handed. */
	assignment: null as AssignmentView | null,
	/** Where the stops stand, which decides whether Start and Complete are enabled. */
	counts: { total: 0, completed: 0, skipped: 0, pending: 0, handled: 0 } as ProgressCounts,
	/** What redraws when the assignment is taken away. */
	listeners: new Set<() => void>(),
	/** The flags each delete carried, in order. */
	removals: [] as Readonly<Record<string, boolean>>[],
	/** The assignees the page can name, by profile id. */
	names: new Map<string, string>(),
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
vi.mock('../../../../../hooks/operations/use-assignment', async () => {
	const { useSyncExternalStore } = await import('react');
	const subscribe = (listener: () => void) => {
		page.listeners.add(listener);
		return () => page.listeners.delete(listener);
	};
	return {
		useAssignment: () => ({
			assignment: useSyncExternalStore(subscribe, () => page.assignment),
			isLoading: false,
			isReady: true,
			isError: false,
		}),
	};
});

vi.mock('../../../../../hooks/operations/use-assignment-stops', () => ({
	useAssignmentStops: () => ({
		stops: [],
		features: [],
		counts: page.counts,
		isLoading: false,
	}),
}));

vi.mock('../../../../../hooks/operations/use-assignee-options', () => ({
	useAssigneeOptions: () => ({ options: [], nameById: page.names }),
}));

vi.mock('../../../../../hooks/mutations/use-assignment-mutations', async () => {
	const { lifecycleWrite } = await import('../refusal-harness');
	const recordRemove = lifecycleWrite('remove');
	return {
		useAssignmentMutations: () => ({
			start: lifecycleWrite('start'),
			complete: lifecycleWrite('complete'),
			cancel: lifecycleWrite('cancel'),
			reopen: lifecycleWrite('reopen'),
			// The real delete is optimistic, so the row leaves the collection the
			// moment it is confirmed and before the server answers; the stand-in
			// takes it off the page the same way, and leaves it off on a refusal.
			remove: async (_id: string, acknowledgements: Readonly<Record<string, boolean>> = {}) => {
				page.removals.push(acknowledgements);
				page.assignment = null;
				for (const listener of page.listeners) {
					listener();
				}
				await recordRemove();
			},
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

vi.mock('../../../../../components/map/stop-sequence-map', () => ({
	StopSequenceMap: () => null,
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
	page.removals.length = 0;
	page.names.clear();
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

/** An assignment with one stop left to work, so Start is enabled. */
function readyAssignment(): AssignmentView {
	page.counts = { total: 1, completed: 0, skipped: 0, pending: 1, handled: 0 };
	return assignment();
}

/** An assignment that is running, with every stop handled, so Complete is enabled. */
function runningAssignment(): AssignmentView {
	page.counts = { total: 2, completed: 2, skipped: 0, pending: 0, handled: 2 };
	return assignment({ status: 'inProgress', startedAt: new Date('2026-08-04T11:05:00Z') });
}

/** An assignment that has ended, so the header offers Reopen and nothing else. */
function completedAssignment(): AssignmentView {
	page.counts = { total: 2, completed: 2, skipped: 0, pending: 0, handled: 2 };
	return assignment({
		status: 'completed',
		startedAt: new Date('2026-08-04T11:05:00Z'),
		completedAt: new Date('2026-08-04T13:00:00Z'),
	});
}

async function renderPage(record: AssignmentView) {
	page.assignment = record;
	await renderRefusalPage(AssignmentRun, 'North loop');
}

describe('a refused lifecycle write on the assignment run page', () => {
	describe('Start', () => {
		it('is a toast carrying the server sentence, and no Alert', async () => {
			harness.refusal = new Error('This assignment has been cancelled.');
			await renderPage(readyAssignment());

			await choose('Start Assignment');

			await waitFor(() => expect(harness.writes).toEqual(['start']));
			await expectRefusalToast('This assignment has been cancelled.');
		});

		it('falls back to the page sentence when the refusal carries none', async () => {
			harness.refusal = 'refused';
			await renderPage(readyAssignment());

			await choose('Start Assignment');

			await waitFor(() => expect(harness.writes).toEqual(['start']));
			await expectRefusalToast('Unable to start this assignment.');
		});
	});

	describe('Complete', () => {
		it('is a toast carrying the server sentence, and no Alert', async () => {
			// A refusal the browser cannot pre-empt: `canCompleteAssignment` already
			// disables Complete over a pending stop, so the server's answer here is
			// one about a race the counts on screen do not show.
			harness.refusal = new Error('This assignment has already been completed.');
			await renderPage(runningAssignment());

			await choose('Complete Assignment');

			await waitFor(() => expect(harness.writes).toEqual(['complete']));
			await expectRefusalToast('This assignment has already been completed.');
		});

		it('falls back to the page sentence when the refusal carries none', async () => {
			harness.refusal = 'refused';
			await renderPage(runningAssignment());

			await choose('Complete Assignment');

			await waitFor(() => expect(harness.writes).toEqual(['complete']));
			await expectRefusalToast('Unable to complete this assignment.');
		});
	});

	describe('Cancel', () => {
		it('is a toast carrying the server sentence, and no Alert', async () => {
			harness.refusal = new Error('This assignment has already been completed.');
			await renderPage(runningAssignment());

			await chooseThroughDialog('Cancel Assignment', 'Cancel Assignment');

			await waitFor(() => expect(harness.writes).toEqual(['cancel']));
			await expectRefusalToast('This assignment has already been completed.');
		});

		it('falls back to the page sentence when the refusal carries none', async () => {
			harness.refusal = 'refused';
			await renderPage(readyAssignment());

			await chooseThroughDialog('Cancel Assignment', 'Cancel Assignment');

			await waitFor(() => expect(harness.writes).toEqual(['cancel']));
			await expectRefusalToast('Unable to cancel this assignment.');
		});
	});

	describe('Reopen', () => {
		it('is a toast carrying the server sentence, and no Alert', async () => {
			harness.refusal = new Error('This assignment is already in progress.');
			await renderPage(completedAssignment());

			await choose('Reopen Assignment');

			await waitFor(() => expect(harness.writes).toEqual(['reopen']));
			await expectRefusalToast('This assignment is already in progress.');
		});

		it('falls back to the page sentence when the refusal carries none', async () => {
			harness.refusal = 'refused';
			await renderPage(completedAssignment());

			await choose('Reopen Assignment');

			await waitFor(() => expect(harness.writes).toEqual(['reopen']));
			await expectRefusalToast('Unable to reopen this assignment.');
		});
	});

	it('raises no toast when the write goes through', async () => {
		await renderPage(readyAssignment());

		await choose('Start Assignment');

		await waitFor(() => expect(harness.writes).toEqual(['start']));
		expect(harness.toastError).not.toHaveBeenCalled();
		expect(screen.queryByRole('alert')).toBeNull();
	});
});

describe('the assignment run page header', () => {
	it('draws the shared bar and none of the controls it replaced', async () => {
		await renderPage(readyAssignment());

		expect(screen.getByRole('banner').getAttribute('data-frame')).toBe('panel');
		expect(screen.getByText(recordNoun('assignment').title)).toBeTruthy();
		expect(screen.getByText('Not started')).toBeTruthy();
		// The stand-in `Link` is an anchor, so the pencil is found by its name.
		expect(screen.getByLabelText('Edit')).toBeTruthy();
		expect(screen.queryByRole('link', { name: recordNoun('assignment').titleMany })).toBeNull();
		expect(screen.queryByRole('link', { name: 'Edit Plan' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
	});

	it('names an unnamed assignment by its formatted date, without the ISO date or the assignee', async () => {
		const assignee = '22222222-2222-4222-8222-222222222222';
		page.names.set(assignee, 'Rivera');
		page.assignment = assignment({ assignmentName: null, assignedToProfileId: assignee });
		await renderRefusalPage(AssignmentRun, 'Tue, Aug 4, 2026');

		const title = screen.getByRole('heading', { level: 1 }).textContent ?? '';
		expect(title).not.toContain('2026-08-04');
		expect(title).not.toContain('Rivera');
	});

	it('offers Start and Cancel on an assignment not yet started, with Delete last', async () => {
		await renderPage(readyAssignment());

		expect(await openMenu()).toEqual([
			'Start Assignment',
			'Cancel Assignment',
			'Delete assignment',
		]);
		expect(screen.getByRole('separator')).toBeTruthy();
	});

	it('offers Complete and Cancel on a running assignment', async () => {
		await renderPage(runningAssignment());

		expect(await openMenu()).toEqual([
			'Complete Assignment',
			'Cancel Assignment',
			'Delete assignment',
		]);
	});

	it('offers Reopen on an assignment that has ended', async () => {
		await renderPage(completedAssignment());

		expect(await openMenu()).toEqual(['Reopen Assignment', 'Delete assignment']);
	});

	// Disabled rather than hidden: the counts under the bar say why, and a
	// missing item would say nothing at all.
	it('keeps Start in the menu, disabled, on an assignment with no stops', async () => {
		await renderPage(assignment());

		await openMenu();
		const start = screen.getByRole('menuitem', { name: 'Start Assignment' });
		expect(start.getAttribute('aria-disabled')).toBe('true');
	});

	it('keeps Complete in the menu, disabled, while a stop is pending', async () => {
		page.counts = { total: 2, completed: 1, skipped: 0, pending: 1, handled: 1 };
		await renderPage(
			assignment({ status: 'inProgress', startedAt: new Date('2026-08-04T11:05:00Z') }),
		);

		expect(screen.getByText('1 stop still pending')).toBeTruthy();
		await openMenu();
		const complete = screen.getByRole('menuitem', { name: 'Complete Assignment' });
		expect(complete.getAttribute('aria-disabled')).toBe('true');
	});

	it('leaves a Collector the progress command and nothing a manager holds', async () => {
		harness.role = 'collector';
		await renderPage(runningAssignment());

		expect(screen.queryByLabelText('Edit')).toBeNull();
		expect(await openMenu()).toEqual(['Complete Assignment']);
	});

	it('draws no menu for a Collector on an assignment that has ended', async () => {
		harness.role = 'collector';
		await renderPage(completedAssignment());

		expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
	});

	it('draws no menu for a Viewer', async () => {
		harness.role = 'viewer';
		await renderPage(runningAssignment());

		expect(screen.queryByLabelText('Edit')).toBeNull();
		expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
	});

	it('deletes the assignment from the last item and lands on Assignment Not Found', async () => {
		await renderPage(readyAssignment());

		await chooseDelete('Delete assignment', 'Delete North loop?', 'Delete Assignment');

		await waitFor(() => expect(harness.writes).toEqual(['remove']));
		expect(await screen.findByText('Assignment Not Found')).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Back to Assignments' })).toBeTruthy();
	});

	// The page holds the delete's runner above the header for this: the row goes
	// the moment the delete is confirmed, the header and its dialog unmount with
	// it, and the question the refusal asks has to be drawn from the page that
	// is left.
	it('asks the refusal question from Assignment Not Found, and resends with the flag', async () => {
		harness.refusal = acknowledgementRefusal('acknowledgedAssignmentItemDeletion');
		await renderPage(readyAssignment());

		await chooseDelete('Delete assignment', 'Delete North loop?', 'Delete Assignment');

		expect(await screen.findByRole('dialog', { name: 'Delete the stops?' })).toBeTruthy();
		expect(screen.getByText('Assignment Not Found')).toBeTruthy();
		expect(harness.toastError).not.toHaveBeenCalled();

		harness.refusal = null;
		fireEvent.click(screen.getByRole('button', { name: 'Delete them' }));

		await waitFor(() => expect(harness.writes).toEqual(['remove', 'remove']));
		expect(page.removals).toEqual([
			{ acknowledgedAssignmentItemDeletion: false },
			{ acknowledgedAssignmentItemDeletion: true },
		]);
		await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
		expect(harness.toastError).not.toHaveBeenCalled();
	});
});

describe('Assignment Not Found', () => {
	it('draws the title and a link back to the Assignments index', async () => {
		page.assignment = null;
		await renderRefusalPage(AssignmentRun, { text: 'Assignment Not Found' });

		const back = screen.getByRole('link', { name: 'Back to Assignments' });
		expect(back.getAttribute('href')).toBe('/operations/assignments');
		expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull();
	});
});

describe('the assignment run page rail', () => {
	// The mission page passes a third tab for its notifications (#1268); an
	// assignment has none to pass.
	it('draws exactly Stops and Comments', async () => {
		await renderPage(assignment());

		expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Stops', 'Comments']);
	});
});

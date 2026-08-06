/**
 * Assignment lifecycle preconditions.
 *
 * `docs/field-work-support-domain.md` states these as requirements on the
 * commands, but the write handlers only ever set timestamps, so client-side
 * guards were the only thing keeping an assignment in a legal state. Anything
 * that talks to the endpoints directly — a second client, import tooling, a
 * replayed offline queue — could complete an assignment that was never started,
 * or progress an item on a cancelled one.
 *
 * The rules are split in two: pure predicates over a loaded snapshot (below),
 * and the transaction reads that build that snapshot. The predicates are where
 * the domain rules live and are directly testable; the loaders are the boring
 * half.
 */

import { CommandError } from '../command-endpoint.js';
import { isProgressBeforeStart, type ProgressTiming } from '../progress-timing.js';
import type { FieldWorkTransaction } from './shared.js';

/** Assignment state, derived from timestamps — there is no status column by design. */
export type AssignmentState = 'not_started' | 'in_progress' | 'completed' | 'cancelled';

/** Assignment item progress. Completed and skipped are mutually exclusive. */
export type AssignmentItemState = 'pending' | 'completed' | 'skipped';

export interface AssignmentSnapshot {
	readonly state: AssignmentState;
	/** Non-deleted items on the assignment. */
	readonly activeItemCount: number;
	/** Active items that are neither completed nor skipped. */
	readonly pendingItemCount: number;
}

/** The item-progress commands that carry a precondition of their own. */
export type ItemProgressCommand = 'complete' | 'reopen' | 'skip' | 'unskip';

/** Every way a lifecycle command can be refused. */
export type LifecycleRejection =
	| 'assignment_not_startable'
	| 'assignment_not_started'
	| 'assignment_not_completable'
	| 'assignment_has_no_items'
	| 'assignment_items_pending'
	| 'assignment_not_reopenable'
	| 'assignment_not_in_progress'
	| 'assignment_item_skipped'
	| 'assignment_item_not_completed'
	| 'assignment_item_not_skipped'
	| 'assignment_item_progress_before_start';

/**
 * What to tell the person who tried.
 *
 * The code alone reaches the client as an error with no `reason`, and every
 * command caller falls back to a generic "unable to" line when one is missing —
 * so a refusal that is entirely explainable ("some stops are still pending")
 * arrives looking like a fault. A total `Record` over the rejection union, so a
 * new refusal cannot be added without wording it.
 */
const REJECTION_REASONS: Record<LifecycleRejection, string> = {
	assignment_not_startable: 'This assignment is closed. Reopen it first.',
	assignment_not_started: 'This assignment has not been started.',
	assignment_not_completable: 'This assignment is already closed.',
	assignment_has_no_items: 'This assignment has no stops.',
	assignment_items_pending: 'Some stops are still pending.',
	assignment_not_reopenable: 'Only a completed or cancelled assignment can be reopened.',
	assignment_not_in_progress: 'This assignment is closed.',
	assignment_item_skipped: 'This stop was skipped. Unskip it first.',
	assignment_item_not_completed: 'This stop is not completed.',
	assignment_item_not_skipped: 'This stop was not skipped.',
	assignment_item_progress_before_start:
		'This stop is dated before the assignment started. Check the assignment start time.',
};

export function readAssignmentState(row: {
	readonly started_at: Date | null;
	readonly completed_at: Date | null;
	readonly cancelled_at: Date | null;
}): AssignmentState {
	if (row.completed_at !== null) {
		return 'completed';
	}
	if (row.cancelled_at !== null) {
		return 'cancelled';
	}
	return row.started_at === null ? 'not_started' : 'in_progress';
}

export function readAssignmentItemState(row: {
	readonly completed_at: Date | null;
	readonly skipped_at: Date | null;
}): AssignmentItemState {
	if (row.skipped_at !== null) {
		return 'skipped';
	}
	return row.completed_at === null ? 'pending' : 'completed';
}

/**
 * Starting is a correction-friendly command — a manager may set the start time
 * on an assignment that is already in progress — so only the terminal states
 * refuse it.
 */
export function checkStartAssignment(snapshot: AssignmentSnapshot): LifecycleRejection | null {
	return snapshot.state === 'completed' || snapshot.state === 'cancelled'
		? 'assignment_not_startable'
		: null;
}

/**
 * The documented set: started, at least one active item, and every active item
 * completed or skipped. Completing items does not auto-complete the assignment,
 * so this is the only place the "all stops handled" rule is checked.
 */
export function checkCompleteAssignment(snapshot: AssignmentSnapshot): LifecycleRejection | null {
	if (snapshot.state === 'not_started') {
		return 'assignment_not_started';
	}
	if (snapshot.state === 'completed' || snapshot.state === 'cancelled') {
		return 'assignment_not_completable';
	}
	if (snapshot.activeItemCount === 0) {
		return 'assignment_has_no_items';
	}
	return snapshot.pendingItemCount > 0 ? 'assignment_items_pending' : null;
}

export function checkReopenAssignment(snapshot: AssignmentSnapshot): LifecycleRejection | null {
	return snapshot.state === 'completed' || snapshot.state === 'cancelled'
		? null
		: 'assignment_not_reopenable';
}

/**
 * Item progress requires a started, non-terminal parent, plus the item's own
 * current state: reopen undoes a completion, unskip undoes a skip, and
 * completing a skipped stop has to go through unskip first rather than silently
 * clearing the skip and its reason.
 */
export function checkItemProgress(
	command: ItemProgressCommand,
	parent: AssignmentState,
	item: AssignmentItemState,
	timing?: ProgressTiming,
): LifecycleRejection | null {
	if (parent === 'not_started') {
		return 'assignment_not_started';
	}
	if (parent === 'completed' || parent === 'cancelled') {
		return 'assignment_not_in_progress';
	}
	if (command === 'complete' && item === 'skipped') {
		return 'assignment_item_skipped';
	}
	if (command === 'reopen' && item !== 'completed') {
		return 'assignment_item_not_completed';
	}
	if (command === 'unskip' && item !== 'skipped') {
		return 'assignment_item_not_skipped';
	}
	// Last, so a stop that is refused for its state is told about its state. The
	// timing rule only ever applies to a transition that is otherwise allowed.
	if (timing !== undefined && isProgressBeforeStart(timing.progressAt, timing.startedAt)) {
		return 'assignment_item_progress_before_start';
	}
	return null;
}

// ===========================================================================
// Transaction reads
// ===========================================================================

export async function loadAssignmentSnapshot(
	trx: FieldWorkTransaction,
	assignmentId: string,
	organizationId: string,
): Promise<AssignmentSnapshot | null> {
	// Locked for the rest of the transaction: the precondition is checked and then
	// written against, so two crews completing the same assignment at once would
	// otherwise both read "no pending stops" and both commit.
	const assignment = await trx
		.selectFrom('assignments')
		.select(['started_at', 'completed_at', 'cancelled_at'])
		.where('id', '=', assignmentId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.forUpdate()
		.executeTakeFirst();
	if (assignment === undefined) {
		return null;
	}

	// Counted in the database rather than by reading every stop: a long route is
	// hundreds of rows and this only ever needs the two totals.
	const counts = await trx
		.selectFrom('assignment_items')
		.select((eb) => [
			eb.fn.countAll<string>().as('active_count'),
			eb.fn
				.countAll<string>()
				.filterWhere('completed_at', 'is', null)
				.filterWhere('skipped_at', 'is', null)
				.as('pending_count'),
		])
		.where('assignment_id', '=', assignmentId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirstOrThrow();

	return {
		state: readAssignmentState(assignment),
		activeItemCount: Number(counts.active_count),
		pendingItemCount: Number(counts.pending_count),
	};
}

/** Throws the documented rejection for an assignment lifecycle command, or returns. */
export async function assertAssignmentTransition(
	trx: FieldWorkTransaction,
	assignmentId: string,
	organizationId: string,
	check: (snapshot: AssignmentSnapshot) => LifecycleRejection | null,
): Promise<void> {
	const snapshot = await loadAssignmentSnapshot(trx, assignmentId, organizationId);
	if (snapshot === null) {
		throw new CommandError(404, { error: 'assignment_not_found' });
	}

	const rejection = check(snapshot);
	if (rejection !== null) {
		throw new CommandError(400, { error: rejection, reason: REJECTION_REASONS[rejection] });
	}
}

/** Throws the documented rejection for an item progress command, or returns. */
export async function assertItemProgress(
	trx: FieldWorkTransaction,
	assignmentItemId: string,
	organizationId: string,
	command: ItemProgressCommand,
	/**
	 * The device-stamped time this command is about, or null when the server is
	 * about to stamp it. Required rather than optional so a new progress command
	 * cannot skip the timing rule by forgetting to pass its timestamp.
	 */
	progressAt: Date | null,
): Promise<void> {
	const item = await trx
		.selectFrom('assignment_items')
		.select(['assignment_id', 'completed_at', 'skipped_at'])
		.where('id', '=', assignmentItemId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (item === undefined) {
		throw new CommandError(404, { error: 'assignment_item_not_found' });
	}

	const assignment = await trx
		.selectFrom('assignments')
		.select(['started_at', 'completed_at', 'cancelled_at'])
		.where('id', '=', item.assignment_id)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (assignment === undefined) {
		throw new CommandError(404, { error: 'assignment_not_found' });
	}

	const rejection = checkItemProgress(
		command,
		readAssignmentState(assignment),
		readAssignmentItemState(item),
		{ progressAt, startedAt: assignment.started_at },
	);
	if (rejection !== null) {
		throw new CommandError(400, { error: rejection, reason: REJECTION_REASONS[rejection] });
	}
}

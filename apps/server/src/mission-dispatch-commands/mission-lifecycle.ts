/**
 * Mission lifecycle preconditions.
 *
 * `docs/mission-dispatch-domain.md` states these as requirements on the
 * commands, but the write handlers only ever set timestamps: a mission item
 * could be completed on a mission that was never started, on a cancelled one, or
 * on top of a skip — silently clearing the skip and its reason. `completeMission`
 * would close a mission with stops still pending. Anything talking to the
 * endpoints directly — a second client, import tooling, a replayed offline queue
 * — could do all of it.
 *
 * Laid out like `../field-work-commands/assignment-lifecycle.ts`, which solved
 * the same problem for assignments: pure predicates over a loaded snapshot
 * first, then the transaction reads that build that snapshot. The predicates are
 * where the domain rules live and are directly testable; the loaders are the
 * boring half.
 *
 * Two things missions carry that assignments do not:
 *
 * - **Auto-start.** A progress command may start a scheduled mission by default
 *   (`autoStartMission`, already on the domain payloads). So "the mission must
 *   be started" is conditional on that flag rather than absolute, and the
 *   command that is allowed through stamps the start it was checked against.
 * - **Stricter item transitions.** The doc rejects completing an
 *   already-completed item and skipping a completed one, where field work
 *   allows both as corrections. Missions are dispatched work, and re-recording
 *   over an outcome loses who recorded it and when.
 */

import { sql } from '@simmer-mosquito/db';
import { CommandError } from '../command-endpoint.js';
import { isProgressBeforeStart, type ProgressTiming } from '../progress-timing.js';
import type { MissionDispatchTransaction } from './shared.js';

/** Mission state, derived from timestamps — there is no status column by design. */
export type MissionState = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

/** Mission item progress. Completed and skipped are mutually exclusive. */
export type MissionItemState = 'pending' | 'completed' | 'skipped';

export interface MissionSnapshot {
	readonly state: MissionState;
	/**
	 * When the mission began, or null while it is scheduled. Carried on the
	 * snapshot so an auto-starting caller can tell "already running" from "about
	 * to be started by me" without a second read.
	 */
	readonly startedAt: Date | null;
	/** Non-deleted items on the mission. */
	readonly activeItemCount: number;
	/** Active items that are neither completed nor skipped. */
	readonly pendingItemCount: number;
}

/** The item-progress commands that carry a precondition of their own. */
export type MissionItemProgressCommand = 'complete' | 'reopen' | 'skip' | 'unskip';

/** Every way a mission lifecycle command can be refused. */
export type MissionRejection =
	| 'mission_already_started'
	| 'mission_not_startable'
	| 'mission_has_no_items'
	| 'mission_not_started'
	| 'mission_not_completable'
	| 'mission_items_pending'
	| 'mission_already_cancelled'
	| 'mission_not_cancellable'
	| 'mission_not_reopenable'
	| 'mission_not_in_progress'
	| 'mission_item_already_completed'
	| 'mission_item_already_skipped'
	| 'mission_item_skipped'
	| 'mission_item_completed'
	| 'mission_item_not_completed'
	| 'mission_item_not_skipped'
	| 'mission_item_progress_before_start'
	| 'mission_item_wrong_control_type'
	| 'mission_item_requested_action_mismatch'
	| 'mission_geometry_not_covered';

/**
 * What to tell the person who tried.
 *
 * The code alone reaches the client as an error with no `reason`, and every
 * command caller falls back to a generic "unable to" line when one is missing —
 * so a refusal that is entirely explainable ("some stops are still pending")
 * arrives looking like a fault. A total `Record` over the rejection union, so a
 * new refusal cannot be added without wording it.
 */
const REJECTION_REASONS: Record<MissionRejection, string> = {
	mission_already_started: 'This mission has already been started.',
	mission_not_startable: 'This mission is closed. Reopen it first.',
	mission_has_no_items: 'This mission has no stops.',
	mission_not_started: 'This mission has not been started.',
	mission_not_completable: 'This mission is already closed.',
	mission_items_pending: 'Some stops are still pending.',
	mission_already_cancelled: 'This mission is already cancelled.',
	mission_not_cancellable: 'This mission is completed. Reopen it before cancelling.',
	mission_not_reopenable: 'Only a completed or cancelled mission can be reopened.',
	mission_not_in_progress: 'This mission is closed.',
	mission_item_already_completed: 'This stop is already completed.',
	mission_item_already_skipped: 'This stop is already skipped.',
	mission_item_skipped: 'This stop was skipped. Unskip it first.',
	mission_item_completed: 'This stop was completed. Reopen it first.',
	mission_item_not_completed: 'This stop is not completed.',
	mission_item_not_skipped: 'This stop was not skipped.',
	mission_item_progress_before_start:
		'This stop is dated before the mission started. Check the mission start time.',
	mission_item_wrong_control_type: 'This mission is not for the kind of work you are recording.',
	mission_item_requested_action_mismatch:
		'This record cites a different requested action than the stop does.',
	mission_geometry_not_covered: 'The work recorded does not cover the area this stop names.',
};

/** Throw the documented refusal, or return. Shared by the execution helpers. */
export function rejectMission(rejection: MissionRejection | null): void {
	if (rejection !== null) {
		throw new CommandError(400, { error: rejection, reason: REJECTION_REASONS[rejection] });
	}
}

export function readMissionState(row: {
	readonly started_at: Date | null;
	readonly completed_at: Date | null;
	readonly cancelled_at: Date | null;
}): MissionState {
	if (row.completed_at !== null) {
		return 'completed';
	}
	if (row.cancelled_at !== null) {
		return 'cancelled';
	}
	return row.started_at === null ? 'scheduled' : 'in_progress';
}

export function readMissionItemState(row: {
	readonly completed_at: Date | null;
	readonly skipped_at: Date | null;
}): MissionItemState {
	if (row.skipped_at !== null) {
		return 'skipped';
	}
	return row.completed_at === null ? 'pending' : 'completed';
}

/**
 * Strict, unlike the assignment version: the doc rejects an already-started
 * mission rather than treating a re-stamp as a correction. Missions are the
 * dispatched plan, and moving the start of one that is already running rewrites
 * the window every progress timestamp on it was judged against.
 */
export function checkStartMission(snapshot: MissionSnapshot): MissionRejection | null {
	if (snapshot.state === 'completed' || snapshot.state === 'cancelled') {
		return 'mission_not_startable';
	}
	if (snapshot.state === 'in_progress') {
		return 'mission_already_started';
	}
	return snapshot.activeItemCount === 0 ? 'mission_has_no_items' : null;
}

/**
 * The documented set: at least one active item, every active item completed or
 * skipped, and not already terminal. A scheduled mission is allowed through when
 * the command auto-starts it — completing a mission nobody remembered to start
 * is the ordinary end of a short one.
 */
export function checkCompleteMission(
	snapshot: MissionSnapshot,
	options: { readonly autoStart: boolean },
): MissionRejection | null {
	if (snapshot.state === 'completed' || snapshot.state === 'cancelled') {
		return 'mission_not_completable';
	}
	if (snapshot.state === 'scheduled' && !options.autoStart) {
		return 'mission_not_started';
	}
	if (snapshot.activeItemCount === 0) {
		return 'mission_has_no_items';
	}
	return snapshot.pendingItemCount > 0 ? 'mission_items_pending' : null;
}

/**
 * Cancelling a scheduled or in-progress mission is the whole point of the
 * command, so only the terminal states refuse — and they refuse differently,
 * because "already cancelled" is a no-op and "completed" has a way forward.
 */
export function checkCancelMission(snapshot: MissionSnapshot): MissionRejection | null {
	if (snapshot.state === 'cancelled') {
		return 'mission_already_cancelled';
	}
	return snapshot.state === 'completed' ? 'mission_not_cancellable' : null;
}

export function checkReopenMission(snapshot: MissionSnapshot): MissionRejection | null {
	return snapshot.state === 'completed' || snapshot.state === 'cancelled'
		? null
		: 'mission_not_reopenable';
}

/** What a progress command needs to know beyond the two states. */
export interface MissionItemProgressContext {
	/**
	 * Whether this command may start a scheduled mission. Only `complete` and
	 * `skip` carry the flag; `reopen` and `unskip` undo progress, and starting a
	 * mission in order to un-record something on it makes no sense.
	 */
	readonly autoStart: boolean;
	readonly timing: ProgressTiming;
}

/**
 * "Progress transitions are strict", as a table: per command, the item states
 * that refuse it and what each one is told. A state the command's entry does not
 * name is a state it accepts.
 *
 * Every transition is one-way. Recording over an outcome a stop already has
 * would lose who recorded it and when, so `complete` and `skip` each send the
 * other's outcome through its undo — and re-recording the outcome a stop is
 * already in is refused as the no-op it is, rather than quietly restamping the
 * profile and time.
 */
const ITEM_PRECONDITIONS: Record<
	MissionItemProgressCommand,
	Partial<Record<MissionItemState, MissionRejection>>
> = {
	complete: { completed: 'mission_item_already_completed', skipped: 'mission_item_skipped' },
	skip: { completed: 'mission_item_completed', skipped: 'mission_item_already_skipped' },
	reopen: { pending: 'mission_item_not_completed', skipped: 'mission_item_not_completed' },
	unskip: { pending: 'mission_item_not_skipped', completed: 'mission_item_not_skipped' },
};

/**
 * Item progress requires a non-terminal parent that is started (or is being
 * started by this very command), plus an item in a state the command accepts.
 */
export function checkMissionItemProgress(
	command: MissionItemProgressCommand,
	parent: MissionState,
	item: MissionItemState,
	context: MissionItemProgressContext,
): MissionRejection | null {
	const parentRejection = checkProgressParent(command, parent, context.autoStart);
	if (parentRejection !== null) {
		return parentRejection;
	}

	const itemRejection = ITEM_PRECONDITIONS[command][item];
	if (itemRejection !== undefined) {
		return itemRejection;
	}

	/*
	 * Last, so a stop that is refused for its state is told about its state — the
	 * timing rule only ever applies to a transition that is otherwise allowed.
	 *
	 * "On or after `started_at` once effective start is known" resolves here to
	 * *the mission was already started before this command ran*. On the auto-start
	 * path `startedAt` is null, because the start this progress time would be
	 * compared against is the one this command is about to stamp — there is no
	 * prior start to be before, and `isProgressBeforeStart` answers false.
	 */
	if (isProgressBeforeStart(context.timing.progressAt, context.timing.startedAt)) {
		return 'mission_item_progress_before_start';
	}
	return null;
}

function checkProgressParent(
	command: MissionItemProgressCommand,
	parent: MissionState,
	autoStart: boolean,
): MissionRejection | null {
	if (parent === 'completed' || parent === 'cancelled') {
		return 'mission_not_in_progress';
	}
	const mayAutoStart = autoStart && (command === 'complete' || command === 'skip');
	return parent === 'scheduled' && !mayAutoStart ? 'mission_not_started' : null;
}

// ===========================================================================
// Transaction reads
// ===========================================================================

async function loadMissionSnapshot(
	trx: MissionDispatchTransaction,
	missionId: string,
	organizationId: string,
): Promise<MissionSnapshot | null> {
	// Locked for the rest of the transaction: the precondition is checked and then
	// written against, so two crews completing the same mission at once would
	// otherwise both read "no pending stops" and both commit.
	const mission = await trx
		.selectFrom('missions')
		.select(['started_at', 'completed_at', 'cancelled_at'])
		.where('id', '=', missionId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.forUpdate()
		.executeTakeFirst();
	if (mission === undefined) {
		return null;
	}

	// Counted in the database rather than by reading every stop: a long mission is
	// hundreds of rows and this only ever needs the two totals.
	const counts = await trx
		.selectFrom('mission_items')
		.select((eb) => [
			eb.fn.countAll<string>().as('active_count'),
			eb.fn
				.countAll<string>()
				.filterWhere('completed_at', 'is', null)
				.filterWhere('skipped_at', 'is', null)
				.as('pending_count'),
		])
		.where('mission_id', '=', missionId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirstOrThrow();

	return {
		state: readMissionState(mission),
		startedAt: mission.started_at,
		activeItemCount: Number(counts.active_count),
		pendingItemCount: Number(counts.pending_count),
	};
}

/**
 * Throws the documented rejection for a mission lifecycle command, or returns
 * the snapshot it was judged against — the caller needs it to decide whether it
 * is also auto-starting.
 */
export async function assertMissionTransition(
	trx: MissionDispatchTransaction,
	missionId: string,
	organizationId: string,
	check: (snapshot: MissionSnapshot) => MissionRejection | null,
): Promise<MissionSnapshot> {
	const snapshot = await loadMissionSnapshot(trx, missionId, organizationId);
	if (snapshot === null) {
		throw new CommandError(404, { error: 'mission_not_found' });
	}

	const rejection = check(snapshot);
	if (rejection !== null) {
		throw new CommandError(400, { error: rejection, reason: REJECTION_REASONS[rejection] });
	}
	return snapshot;
}

/** Throws the documented rejection for an item progress command, or returns. */
export async function assertMissionItemProgress(
	trx: MissionDispatchTransaction,
	missionItemId: string,
	organizationId: string,
	command: MissionItemProgressCommand,
	options: {
		/**
		 * The device-stamped time this command is about, or null when the server is
		 * about to stamp it. Required rather than optional so a new progress command
		 * cannot skip the timing rule by forgetting to pass its timestamp.
		 */
		readonly progressAt: Date | null;
		/** The command's `autoStartMission`; false for the commands that lack it. */
		readonly autoStart: boolean;
	},
): Promise<{ readonly missionId: string; readonly snapshot: MissionSnapshot }> {
	const item = await trx
		.selectFrom('mission_items')
		.select(['mission_id', 'completed_at', 'skipped_at'])
		.where('id', '=', missionItemId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (item === undefined) {
		throw new CommandError(404, { error: 'mission_item_not_found' });
	}

	const snapshot = await loadMissionSnapshot(trx, item.mission_id, organizationId);
	if (snapshot === null) {
		throw new CommandError(404, { error: 'mission_not_found' });
	}

	const rejection = checkMissionItemProgress(command, snapshot.state, readMissionItemState(item), {
		autoStart: options.autoStart,
		timing: { progressAt: options.progressAt, startedAt: snapshot.startedAt },
	});
	if (rejection !== null) {
		throw new CommandError(400, { error: rejection, reason: REJECTION_REASONS[rejection] });
	}
	return { missionId: item.mission_id, snapshot };
}

/**
 * Stamp the start a progress command implied, when the mission had not been
 * started and the command allows it.
 *
 * `started_at` is set to the progress timestamp rather than `now()` so the
 * mission's window contains the work that opened it. `checkMissionItemProgress`
 * has already let this command through on the strength of the auto-start flag,
 * so this is the write half of that decision and never a decision of its own —
 * hence the snapshot argument rather than a fresh read. The row is locked by
 * `loadMissionSnapshot`, so no concurrent start can land between the two.
 */
export async function autoStartMissionIfScheduled(
	trx: MissionDispatchTransaction,
	missionId: string,
	organizationId: string,
	snapshot: MissionSnapshot,
	options: {
		readonly autoStart: boolean;
		readonly startedAt: Date | null;
		readonly actorProfileId: string;
	},
): Promise<void> {
	if (!options.autoStart || snapshot.state !== 'scheduled') {
		return;
	}

	await trx
		.updateTable('missions')
		.set({
			started_at: options.startedAt ?? sql`now()`,
			updated_by_profile_id: options.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', missionId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.where('started_at', 'is', null)
		.execute();
}

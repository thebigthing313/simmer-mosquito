/**
 * The mission acknowledgements that turn on state.
 *
 * `mission-lifecycle.ts` holds the refusals a mission command cannot be talked
 * out of: a completed mission cannot be started, a skipped stop cannot be
 * completed. These are the other half. Each one is a fact about the mission or
 * the stop that makes a write worth a second look without making it wrong, so
 * the caller is asked rather than refused, and a caller that has already asked
 * sends the flag and is not asked again.
 *
 * The shape is the one #317 settled, and the two worked examples are
 * `assertNoPendingTrapCollection` in `../adult-surveillance-commands/collections.ts`
 * and `assertClosedRequestAcknowledged` in
 * `../public-engagement-records-commands/service-requests.ts`: a confirmed flag
 * returns before the read, a withheld one reads the state and hands
 * `requireStateAcknowledgement` a boolean and a sentence. The refusal is
 * `409 acknowledgement_required` naming the flag, with an empty `consequences`
 * list, because none of these conditions is a count. "This mission has been
 * worked" is true or it is not, and how many records make it true does not
 * change what the caller has to decide.
 *
 * ## Where they run
 *
 * In the writers, before the first write of the command they belong to, so a
 * refusal leaves the mission exactly as it was. They are not in a registry:
 * which state a command has to ask about is part of what the command means, and
 * the reads are here because this is the module that knows how to do them.
 *
 * ## The trap
 *
 * `acknowledged()` reads an absent flag as confirmed, so every guard here fires
 * only for a caller that sends `false` on purpose. Nothing in `apps/web` does
 * yet, and #319 is that half. The integration suite is what exercises them
 * until it lands.
 */

import { sql } from '@simmer-mosquito/db';
import { requireStateAcknowledgement, type StateAcknowledgement } from '../acknowledgements.js';
import type { MissionDispatchTransaction } from './shared.js';

/**
 * Ask the state, and only when the caller has not already answered.
 *
 * The early return is why every reader below is a function rather than a value:
 * the ordinary write confirms the flag by omitting it, and paying for a query
 * to establish something the caller has already agreed to would put a read on
 * every mission write in the product.
 */
async function guard(input: {
	readonly acknowledgement: StateAcknowledgement;
	readonly acknowledged: boolean;
	readonly message: string;
	readonly read: () => Promise<boolean>;
}): Promise<void> {
	if (input.acknowledged === true) {
		return;
	}
	requireStateAcknowledgement({
		state: await input.read(),
		acknowledgement: input.acknowledgement,
		acknowledged: input.acknowledged,
		message: input.message,
	});
}

// ===========================================================================
// State reads
// ===========================================================================

/** Whether the mission has been started and is neither completed nor cancelled. */
async function missionIsInProgress(
	trx: MissionDispatchTransaction,
	missionId: string,
	organizationId: string,
): Promise<boolean> {
	const mission = await missionTimestamps(trx, missionId, organizationId);
	return (
		mission !== null &&
		mission.started_at !== null &&
		mission.completed_at === null &&
		mission.cancelled_at === null
	);
}

/** The mission's own timestamps, or null when it is deleted or another agency's. */
async function missionTimestamps(
	trx: MissionDispatchTransaction,
	missionId: string,
	organizationId: string,
): Promise<{
	readonly started_at: Date | null;
	readonly completed_at: Date | null;
	readonly cancelled_at: Date | null;
} | null> {
	const row = await trx
		.selectFrom('missions')
		.select(['started_at', 'completed_at', 'cancelled_at'])
		.where('id', '=', missionId)
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	return row ?? null;
}

/**
 * Whether any actual control work is filed against a mission's stops.
 *
 * Four tables, because a mission's control type decides which one the work
 * lands in and the guard has to hold for all four. Written as one statement
 * rather than four round trips: it runs only on the withheld path, but a
 * cancellation guard that took four queries to answer one yes/no would be four
 * places for the next control type to be forgotten.
 */
async function anyActualActionOnMission(
	trx: MissionDispatchTransaction,
	missionId: string,
	organizationId: string,
): Promise<boolean> {
	const found = await sql<{ present: number }>`
		select 1 as present
		from mission_items item
		where item.mission_id = ${missionId}
			and item.organization_id = ${organizationId}
			and item.deleted_at is null
			and exists (
				select 1 from applications where mission_item_id = item.id and deleted_at is null
				union all
				select 1 from source_reductions where mission_item_id = item.id and deleted_at is null
				union all
				select 1 from outreach_actions where mission_item_id = item.id and deleted_at is null
				union all
				select 1 from biocontrol_actions where mission_item_id = item.id and deleted_at is null
			)
		limit 1
	`.execute(trx);
	return found.rows.length > 0;
}

/**
 * Whether any active stop matching the filter has been completed or skipped.
 *
 * One reader for the two questions the progress guards ask, because they differ
 * only in which stops they are about: a whole mission's, for cancellation, or
 * the handful a caller named, for a move or an edit.
 */
async function anyProgressedStop(
	trx: MissionDispatchTransaction,
	organizationId: string,
	filter: { readonly missionId: string } | { readonly missionItemIds: readonly string[] },
): Promise<boolean> {
	if ('missionItemIds' in filter && filter.missionItemIds.length === 0) {
		return false;
	}
	const stops = trx
		.selectFrom('mission_items')
		.select('id')
		.where('organization_id', '=', organizationId)
		.where('deleted_at', 'is', null)
		.where((eb) => eb.or([eb('completed_at', 'is not', null), eb('skipped_at', 'is not', null)]))
		.limit(1);
	const row = await ('missionId' in filter
		? stops.where('mission_id', '=', filter.missionId)
		: stops.where('id', 'in', filter.missionItemIds)
	).executeTakeFirst();
	return row !== undefined;
}

// ===========================================================================
// In progress
// ===========================================================================

/**
 * Changing the stop list of a mission a crew is out on.
 *
 * The crew is working a worklist that is about to be a different worklist. It
 * is ordinary enough — a request comes in mid-round and the nearest crew takes
 * it — so it asks rather than refuses.
 */
export async function assertInProgressMissionChangeAcknowledged(
	trx: MissionDispatchTransaction,
	missionId: string,
	organizationId: string,
	acknowledged: boolean,
): Promise<void> {
	await guard({
		acknowledgement: 'acknowledgedInProgressMissionChange',
		acknowledged,
		message: 'This mission is in progress, and the crew is working its stops.',
		read: () => missionIsInProgress(trx, missionId, organizationId),
	});
}

/** Handing an in-progress mission to somebody else, or taking it off its crew. */
export async function assertInProgressAssignmentChangeAcknowledged(
	trx: MissionDispatchTransaction,
	missionId: string,
	organizationId: string,
	acknowledged: boolean,
): Promise<void> {
	await guard({
		acknowledgement: 'acknowledgedInProgressAssignmentChange',
		acknowledged,
		message: 'This mission is already in progress under its current assignee.',
		read: () => missionIsInProgress(trx, missionId, organizationId),
	});
}

// ===========================================================================
// Worked
// ===========================================================================

/**
 * Changing the plan of a mission somebody has already worked.
 *
 * "Worked" is actual control work filed against its stops, not stop progress:
 * the plan is what the record inherited its method from, so moving it after the
 * fact leaves records filed under a plan the mission no longer has. Progressed
 * stops with no records on them are the cancellation guard's question, below.
 */
export async function assertWorkedMissionPlanChangeAcknowledged(
	trx: MissionDispatchTransaction,
	missionId: string,
	organizationId: string,
	acknowledged: boolean,
): Promise<void> {
	await guard({
		acknowledgement: 'acknowledgedWorkedMissionPlanChange',
		acknowledged,
		message: 'Control work has already been recorded against this mission.',
		read: () => anyActualActionOnMission(trx, missionId, organizationId),
	});
}

/** Moving the window of a mission somebody has already worked. */
export async function assertWorkedMissionScheduleChangeAcknowledged(
	trx: MissionDispatchTransaction,
	missionId: string,
	organizationId: string,
	acknowledged: boolean,
): Promise<void> {
	await guard({
		acknowledgement: 'acknowledgedWorkedMissionScheduleChange',
		acknowledged,
		message: 'Control work has already been recorded against this mission.',
		read: () => anyActualActionOnMission(trx, missionId, organizationId),
	});
}

// ===========================================================================
// Cancellation
// ===========================================================================

/**
 * Cancelling a mission whose stops have been handled.
 *
 * The domain doc asks for an acknowledgement "if item progress or linked actual
 * actions exist", and those are the two flags: this one is the progress, and
 * {@link assertPartialWorkCancellationAcknowledged} is the records. They are
 * asked separately because they are different losses. Progress is a crew's
 * account of where they got to, and cancelling keeps it but marks the mission
 * as never run.
 */
export async function assertProgressedMissionCancellationAcknowledged(
	trx: MissionDispatchTransaction,
	missionId: string,
	organizationId: string,
	acknowledged: boolean,
): Promise<void> {
	await guard({
		acknowledgement: 'acknowledgedProgressedMissionCancellation',
		acknowledged,
		message: 'Stops on this mission have already been completed or skipped.',
		read: () => anyProgressedStop(trx, organizationId, { missionId }),
	});
}

/**
 * Cancelling a mission that has real records on it.
 *
 * Cancelling is only ever possible before the mission is completed, so work
 * already recorded on one is by definition part of the job, and the mission it
 * belongs to is about to say it never ran.
 */
export async function assertPartialWorkCancellationAcknowledged(
	trx: MissionDispatchTransaction,
	missionId: string,
	organizationId: string,
	acknowledged: boolean,
): Promise<void> {
	await guard({
		acknowledgement: 'acknowledgedPartialWorkCancellation',
		acknowledged,
		message: 'Part of this mission has already been carried out and recorded.',
		read: () => anyActualActionOnMission(trx, missionId, organizationId),
	});
}

// ===========================================================================
// Deletion
// ===========================================================================

/**
 * Deleting a mission that ran to completion.
 *
 * Distinct from the three delete-registry flags the same command carries: those
 * count what goes with it, and this is the mission's own state. A completed
 * mission is a record of work done, so removing one is ordinarily a correction
 * of a mission that should never have been raised rather than a tidy-up.
 */
export async function assertCompletedMissionDeletionAcknowledged(
	trx: MissionDispatchTransaction,
	missionId: string,
	organizationId: string,
	acknowledged: boolean,
): Promise<void> {
	await guard({
		acknowledgement: 'acknowledgedCompletedMissionDeletion',
		acknowledged,
		message: 'This mission was completed, and deleting it removes a record of work done.',
		read: async () => {
			const mission = await missionTimestamps(trx, missionId, organizationId);
			return mission !== null && mission.completed_at !== null;
		},
	});
}

// ===========================================================================
// Stops
// ===========================================================================

/**
 * Moving the ground or the link under a stop somebody has already handled.
 *
 * The progress says the crew treated the place the stop named, and this changes
 * what it named after the fact.
 */
export async function assertProgressedItemLinkChangeAcknowledged(
	trx: MissionDispatchTransaction,
	missionItemId: string,
	organizationId: string,
	acknowledged: boolean,
): Promise<void> {
	await guard({
		acknowledgement: 'acknowledgedProgressedItemLinkChange',
		acknowledged,
		message: 'This stop has already been completed or skipped.',
		read: () => anyProgressedStop(trx, organizationId, { missionItemIds: [missionItemId] }),
	});
}

/** Reordering a worklist whose crew has already got part-way down it. */
export async function assertProgressedItemReorderAcknowledged(
	trx: MissionDispatchTransaction,
	organizationId: string,
	missionItemIds: readonly string[],
	acknowledged: boolean,
): Promise<void> {
	await guard({
		acknowledgement: 'acknowledgedProgressedItemReorder',
		acknowledged,
		message: 'Some of the stops being moved have already been completed or skipped.',
		read: () => anyProgressedStop(trx, organizationId, { missionItemIds }),
	});
}

/** Dropping a stop that carries a crew's account of what happened at it. */
export async function assertItemProgressDeletionAcknowledged(
	trx: MissionDispatchTransaction,
	missionItemId: string,
	organizationId: string,
	acknowledged: boolean,
): Promise<void> {
	await guard({
		acknowledgement: 'acknowledgedItemProgressDeletion',
		acknowledged,
		message: 'This stop has already been completed or skipped, and removing it drops that.',
		read: () => anyProgressedStop(trx, organizationId, { missionItemIds: [missionItemId] }),
	});
}

/**
 * Moving the ground or the link under a stop that records already cite.
 *
 * A Chemical Application or a Source Reduction filed from a stop keeps its own
 * geometry and its own requested-action link, so nothing about it changes when
 * the stop does. That is the point: the record now says it was made at a stop
 * that names somewhere else, and the provenance reads as a contradiction.
 */
export async function assertActualActionContextChangeAcknowledged(
	trx: MissionDispatchTransaction,
	missionItemId: string,
	acknowledged: boolean,
): Promise<void> {
	await guard({
		acknowledgement: 'acknowledgedActualActionContextChange',
		acknowledged,
		message: 'Control work has already been recorded against this stop.',
		read: () => anyActualActionOnStop(trx, missionItemId),
	});
}

/**
 * Removing a stop that records cite.
 *
 * The same fact as {@link assertActualActionContextChangeAcknowledged}, asked
 * about a removal. The records survive it — `mission_item_id` is left alone by
 * a soft delete, and the mission delete is where the registry detaches them —
 * so what the caller is confirming is that the work stays filed against a stop
 * that is no longer on the mission.
 */
export async function assertActualActionDetachAcknowledged(
	trx: MissionDispatchTransaction,
	missionItemId: string,
	acknowledged: boolean,
): Promise<void> {
	await guard({
		acknowledgement: 'acknowledgedActualActionDetach',
		acknowledged,
		message: 'Control work has already been recorded against this stop.',
		read: () => anyActualActionOnStop(trx, missionItemId),
	});
}

// ===========================================================================
// The requested action a stop is raised from
// ===========================================================================

/**
 * Scheduling a request the mission's plan disagrees with.
 *
 * A Requested Control Action may recommend a method, and a mission is planned
 * with one. Both are advice rather than rules — the record filed at the end
 * stores its own method — so a stop that carries a request recommending
 * something the mission is not planned to do is worth saying out loud and is
 * not wrong. A mission with no planned method has nothing to disagree with, and
 * neither does a request that recommends nothing.
 */
async function assertMethodMismatchAcknowledged(
	trx: MissionDispatchTransaction,
	input: {
		readonly organizationId: string;
		readonly plannedMethodId: string | null;
		readonly requestedControlActionId: string;
		readonly acknowledged: boolean;
	},
): Promise<void> {
	if (input.plannedMethodId === null) {
		return;
	}
	await guard({
		acknowledgement: 'acknowledgedMethodMismatch',
		acknowledged: input.acknowledged,
		message: 'This request recommends a different method than the mission is planned for.',
		read: async () => {
			const request = await trx
				.selectFrom('requested_control_actions')
				.select('recommended_method_id')
				.where('id', '=', input.requestedControlActionId)
				.where('organization_id', '=', input.organizationId)
				.where('deleted_at', 'is', null)
				.executeTakeFirst();
			return (
				request?.recommended_method_id != null &&
				request.recommended_method_id !== input.plannedMethodId
			);
		},
	});
}

/**
 * Scheduling a request that is already on a stop somewhere.
 *
 * Legitimate often enough to be routine: an area split across two crews, a
 * retry after rain, a multi-day response. What it also is, when nobody meant
 * it, is the same job dispatched twice, so the caller says which.
 */
async function assertDuplicateRequestedActionMissioningAcknowledged(
	trx: MissionDispatchTransaction,
	input: {
		readonly organizationId: string;
		readonly requestedControlActionId: string;
		/** The stop being edited, which does not count as its own duplicate. */
		readonly exceptMissionItemId?: string;
		readonly acknowledged: boolean;
	},
): Promise<void> {
	await guard({
		acknowledgement: 'acknowledgedDuplicateRequestedActionMissioning',
		acknowledged: input.acknowledged,
		message: 'This request is already a stop on a mission.',
		read: async () => {
			const stops = trx
				.selectFrom('mission_items')
				.select('id')
				.where('organization_id', '=', input.organizationId)
				.where('requested_control_action_id', '=', input.requestedControlActionId)
				.where('deleted_at', 'is', null)
				.limit(1);
			const row = await (input.exceptMissionItemId === undefined
				? stops
				: stops.where('id', '!=', input.exceptMissionItemId)
			).executeTakeFirst();
			return row !== undefined;
		},
	});
}

// ===========================================================================
// Early start
// ===========================================================================

/**
 * How far ahead of its scheduled start a mission may be worked without asking.
 *
 * Twelve hours, from `docs/mission-dispatch-domain.md`: "Assigned collectors
 * may start or progress a mission up to 12 hours before its scheduled start.
 * Managers may start earlier with acknowledgement." Only the acknowledgement
 * half is here. The role half of that sentence, which refuses a collector
 * outright, is a permission rule and this is not the place it would live.
 */
const EARLY_START_ALLOWANCE_MS = 12 * 60 * 60 * 1000;

/**
 * Starting or progressing a mission well before it was due.
 *
 * `at` is the moment the command is about: the timestamp a device recorded, or
 * the server's own clock when the command names none, in which case a write
 * that is not early cannot become early by being slow.
 */
export async function assertEarlyStartAcknowledged(
	trx: MissionDispatchTransaction,
	input: {
		readonly missionId: string;
		readonly organizationId: string;
		readonly at: Date | null;
		readonly acknowledged: boolean;
	},
): Promise<void> {
	await guard({
		acknowledgement: 'acknowledgedEarlyStart',
		acknowledged: input.acknowledged,
		message: 'This mission is not due to start for more than twelve hours.',
		read: async () => {
			const mission = await trx
				.selectFrom('missions')
				.select('scheduled_start_at')
				.where('id', '=', input.missionId)
				.where('organization_id', '=', input.organizationId)
				.where('deleted_at', 'is', null)
				.executeTakeFirst();
			if (mission === undefined) {
				return false;
			}
			const at = input.at ?? new Date();
			return at.getTime() < mission.scheduled_start_at.getTime() - EARLY_START_ALLOWANCE_MS;
		},
	});
}

// ===========================================================================
// Shared reads for the stop guards
// ===========================================================================

/** Whether any actual control work is filed against one stop. */
async function anyActualActionOnStop(
	trx: MissionDispatchTransaction,
	missionItemId: string,
): Promise<boolean> {
	const found = await sql<{ present: number }>`
		select 1 as present
		from (
			select mission_item_id, deleted_at from applications
			union all
			select mission_item_id, deleted_at from source_reductions
			union all
			select mission_item_id, deleted_at from outreach_actions
			union all
			select mission_item_id, deleted_at from biocontrol_actions
		) as action
		where action.mission_item_id = ${missionItemId} and action.deleted_at is null
		limit 1
	`.execute(trx);
	return found.rows.length > 0;
}

/**
 * The two questions a stop that carries a requested action has to answer.
 *
 * One entry point, because the four commands that link a request all ask both
 * and a caller that stated one flag and not the other should still be asked
 * about the other. A stop with no request answers neither, and returns before
 * any read.
 *
 * `plan` is where the mission's planned method comes from. A create states it,
 * because the mission is not in the database yet; an add names the mission; an
 * edit names the stop, and the mission is looked up through it.
 */
export async function assertRequestedActionAcknowledged(
	trx: MissionDispatchTransaction,
	input: {
		readonly organizationId: string;
		readonly requestedControlActionId: string | null;
		readonly plan:
			| { readonly plannedMethodId: string | null }
			| { readonly missionId: string }
			| { readonly missionItemId: string };
		/** The stop being edited, which does not count as its own duplicate. */
		readonly exceptMissionItemId?: string;
		readonly acknowledgedMethodMismatch: boolean;
		readonly acknowledgedDuplicateRequestedActionMissioning: boolean;
	},
): Promise<void> {
	const requestedControlActionId = input.requestedControlActionId;
	if (requestedControlActionId === null) {
		return;
	}
	await assertMethodMismatchAcknowledged(trx, {
		organizationId: input.organizationId,
		plannedMethodId: await resolvePlannedMethodId(trx, input.organizationId, input.plan),
		requestedControlActionId,
		acknowledged: input.acknowledgedMethodMismatch,
	});
	await assertDuplicateRequestedActionMissioningAcknowledged(trx, {
		organizationId: input.organizationId,
		requestedControlActionId,
		...(input.exceptMissionItemId === undefined
			? {}
			: { exceptMissionItemId: input.exceptMissionItemId }),
		acknowledged: input.acknowledgedDuplicateRequestedActionMissioning,
	});
}

async function resolvePlannedMethodId(
	trx: MissionDispatchTransaction,
	organizationId: string,
	plan:
		| { readonly plannedMethodId: string | null }
		| { readonly missionId: string }
		| { readonly missionItemId: string },
): Promise<string | null> {
	if ('plannedMethodId' in plan) {
		return plan.plannedMethodId;
	}
	const missions = trx
		.selectFrom('missions')
		.select('missions.planned_method_id')
		.where('missions.organization_id', '=', organizationId)
		.where('missions.deleted_at', 'is', null);
	const row = await ('missionId' in plan
		? missions.where('missions.id', '=', plan.missionId)
		: missions
				.innerJoin('mission_items', 'mission_items.mission_id', 'missions.id')
				.where('mission_items.id', '=', plan.missionItemId)
				.where('mission_items.deleted_at', 'is', null)
	).executeTakeFirst();
	return row?.planned_method_id ?? null;
}

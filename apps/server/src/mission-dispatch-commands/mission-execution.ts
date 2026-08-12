/**
 * Recording the control work a mission stop was dispatched for.
 *
 * `docs/mission-dispatch-domain.md` has specified this since the domain was
 * written — the `mission_item_id` columns, the four helper commands, the
 * defaults — but nothing implemented it: no handler ever wrote the column, and
 * every create page sent `missionItemId: null`. This is that half.
 *
 * The shape mirrors `field-work-commands/assignment-lifecycle.ts`, because the
 * two are the same idea: a stop names a place someone was sent, and the record
 * they made there is what closes it. What differs is what a mission stop
 * additionally has to agree with — the mission's control type, the requested
 * action it was raised from, and the ground it covers.
 */

import { geojsonToGeom, sql } from '@simmer-mosquito/db';
import type { PerformedControlActionKind } from '@simmer-mosquito/domain';
import { CommandError } from '../command-endpoint.js';
import {
	assertMissionItemProgress,
	autoStartMissionIfScheduled,
	type MissionSnapshot,
	rejectMission,
} from './mission-lifecycle.js';
import type { MissionDispatchTransaction } from './shared.js';

/** The `control_type` each helper is allowed to record against. */
const CONTROL_TYPE_FOR_KIND: Record<PerformedControlActionKind, string> = {
	chemicalApplication: 'application',
	sourceReduction: 'source_reduction',
	outreach: 'outreach',
	biocontrol: 'biocontrol',
};

/** The execution fields every helper payload carries, whatever it records. */
export interface MissionExecutionCommandFields {
	readonly organizationId: string;
	readonly actorProfileId: string;
	readonly missionItemId: string;
	readonly completeMissionItem: boolean;
	readonly autoStartMission: boolean;
	readonly acknowledgedMissionGeometryNotCovered: boolean;
	readonly acknowledgedRequestedActionMismatch: boolean;
	readonly requestedControlActionId?: string | null;
}

export interface MissionExecutionStop {
	readonly missionId: string;
	readonly snapshot: MissionSnapshot;
	/**
	 * The requested action the stop was raised from, if any. Helpers default the
	 * action's own link from this, so the ordinary call carries none and cannot
	 * disagree with the stop.
	 */
	readonly requestedControlActionId: string | null;
	/**
	 * The mission's planned method, which a helper that names none falls back to.
	 * Missions are planned with one; the record still stores its own.
	 */
	readonly plannedMethodId: string | null;
}

/**
 * Validate a mission stop for execution and return what the caller needs.
 *
 * Runs before anything is written. The mission row is locked by the progress
 * assertion, so the auto-start that may follow cannot race a concurrent one.
 */
export async function beginMissionExecution(
	trx: MissionDispatchTransaction,
	payload: MissionExecutionCommandFields,
	kind: PerformedControlActionKind,
): Promise<MissionExecutionStop> {
	const item = await trx
		.selectFrom('mission_items')
		.select(['mission_id', 'requested_control_action_id'])
		.where('id', '=', payload.missionItemId)
		.where('organization_id', '=', payload.organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (item === undefined) {
		throw new CommandError(404, { error: 'mission_item_not_found' });
	}

	const mission = await trx
		.selectFrom('missions')
		.select(['control_type', 'planned_method_id'])
		.where('id', '=', item.mission_id)
		.where('organization_id', '=', payload.organizationId)
		.where('deleted_at', 'is', null)
		.executeTakeFirst();
	if (mission === undefined) {
		throw new CommandError(404, { error: 'mission_not_found' });
	}

	// A mission is typed once, at the parent. Recording an application against a
	// source-reduction mission is always a bug, so no acknowledgement clears it.
	rejectMission(
		mission.control_type === CONTROL_TYPE_FOR_KIND[kind] ? null : 'mission_item_wrong_control_type',
	);

	// Citing a different requested action than the stop was raised from is
	// occasionally legitimate, so it asks rather than refuses.
	const explicit = payload.requestedControlActionId ?? null;
	rejectMission(
		explicit !== null &&
			item.requested_control_action_id !== null &&
			explicit !== item.requested_control_action_id &&
			!payload.acknowledgedRequestedActionMismatch
			? 'mission_item_requested_action_mismatch'
			: null,
	);

	// Reuses the progress precondition rather than restating it: recording work
	// completes the stop, so it has to be a legal completion.
	const { missionId, snapshot } = await assertMissionItemProgress(
		trx,
		payload.missionItemId,
		payload.organizationId,
		'complete',
		{ progressAt: null, autoStart: payload.autoStartMission },
	);

	return {
		missionId,
		snapshot,
		requestedControlActionId: explicit ?? item.requested_control_action_id,
		plannedMethodId: mission.planned_method_id,
	};
}

/**
 * The method the record is filed under: the one the crew named, else the one
 * the mission was planned with.
 *
 * Refused rather than defaulted to nothing, because the column is required and
 * a mission planned without a method that is executed without one is a gap in
 * the plan, not a record to invent.
 */
export function resolveMissionMethodId(
	explicit: string | null | undefined,
	stop: MissionExecutionStop,
): string {
	const resolved = explicit ?? stop.plannedMethodId;
	if (resolved === null || resolved === undefined) {
		throw new CommandError(400, {
			error: 'mission_method_required',
			reason: 'This mission has no planned method, so the record needs one.',
		});
	}
	return resolved;
}

/**
 * The same default for a record whose method column is nullable.
 *
 * Only chemical applications are in this position: an application may legally
 * be filed with no method, so the mission's plan is a default here and never a
 * requirement. Refusing as {@link resolveMissionMethodId} does would make a
 * mission-recorded application stricter than the same application recorded
 * off-mission, which is a rule nothing asked for.
 */
export function defaultMissionMethodId(
	explicit: string | null | undefined,
	stop: MissionExecutionStop,
): string | null {
	return explicit ?? stop.plannedMethodId ?? null;
}

/**
 * Where the recorded work happened.
 *
 * Defaults to the stop's own geometry, which is the ordinary case: the crew
 * treated the place they were sent. An explicit `geometry` on the command
 * overrides it, for the treatment that ran wider or narrower than planned — and
 * that is the case the coverage check then has an opinion about.
 */
export function missionItemGeom(
	missionItemId: string,
	geometry: unknown,
): ReturnType<typeof geojsonToGeom> {
	return (
		geometry === undefined || geometry === null
			? sql`(select geom from mission_items where id = ${missionItemId})`
			: geojsonToGeom(geometry as Parameters<typeof geojsonToGeom>[0])
	) as ReturnType<typeof geojsonToGeom>;
}

/**
 * Refuse work that does not cover the ground the stop names, unless the caller
 * has said it meant to.
 *
 * "Covers" is PostGIS `ST_Covers`, which is what the doc asks for: for a point
 * stop that means the point lies on or within the action geometry; for a line
 * or polygon stop the whole of it must lie inside. A treatment recorded a
 * street away from the stop that dispatched it is the case this catches, and it
 * is a warning rather than a refusal because ground truth beats the plan often
 * enough to be routine.
 */
export async function assertMissionGeometryCovered(
	trx: MissionDispatchTransaction,
	payload: MissionExecutionCommandFields,
	actionId: string,
	actionTable: 'applications' | 'source_reductions' | 'outreach_actions' | 'biocontrol_actions',
): Promise<void> {
	if (payload.acknowledgedMissionGeometryNotCovered) {
		return;
	}

	const row = await trx
		.selectFrom('mission_items')
		.select((eb) => [
			sql<boolean>`st_covers(
				(select geom from ${sql.table(actionTable)} where id = ${actionId}),
				mission_items.geom
			)`.as('covered'),
			eb.val(1).as('present'),
		])
		.where('id', '=', payload.missionItemId)
		.where('organization_id', '=', payload.organizationId)
		.executeTakeFirst();

	// A null answer means one of the geometries is missing, which is not the same
	// as "does not cover" and is not this check's business to refuse.
	rejectMission(row?.covered === false ? 'mission_geometry_not_covered' : null);
}

/**
 * Complete the stop the record was just written for, and stamp the start it
 * implied.
 *
 * Deliberately does not re-run the progress assertion: `beginMissionExecution`
 * locked the mission and judged this transition, and the record written between
 * them is what the completion is for.
 */
export async function finishMissionExecution(
	trx: MissionDispatchTransaction,
	payload: MissionExecutionCommandFields,
	stop: MissionExecutionStop,
): Promise<void> {
	await autoStartMissionIfScheduled(trx, stop.missionId, payload.organizationId, stop.snapshot, {
		autoStart: payload.autoStartMission,
		startedAt: null,
		actorProfileId: payload.actorProfileId,
	});

	if (!payload.completeMissionItem) {
		return;
	}

	await trx
		.updateTable('mission_items')
		.set({
			completed_at: sql`now()`,
			completed_by_profile_id: payload.actorProfileId,
			skipped_at: null,
			skipped_by_profile_id: null,
			skip_reason: null,
			updated_by_profile_id: payload.actorProfileId,
			updated_at: sql`now()`,
		})
		.where('id', '=', payload.missionItemId)
		.where('organization_id', '=', payload.organizationId)
		.where('deleted_at', 'is', null)
		.execute();
}

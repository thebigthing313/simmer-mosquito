/**
 * Recording a larval inspection, correcting one, and removing one.
 *
 * ## A create is one of three commands, and the caller says which
 *
 * The route this replaces sent one row and let the server read the payload for
 * an answer: an `assignmentItemId` meant the stop-execution command, a
 * `habitatId` meant the habitat inspection, neither meant the ad hoc one. Those
 * are three genuinely different records — one closes an assignment stop, one
 * attaches to a habitat, one carries its own geometry — so {@link
 * InspectionPlacement} states which, and the id that goes with it travels as
 * part of that statement rather than as a column the server interprets.
 *
 * The stop case is a `fieldWork.*` command written to this table: the endpoint
 * follows the table and the vocabulary follows the unit of work. It records the
 * inspection and completes the stop in one transaction, so the work can never
 * exist with the stop still pending. `completedAt` is deliberately not sent —
 * the server dates the completion, which is what the replaced route did too.
 *
 * It is also the one recording that cannot go through `mutateCollection`: two
 * rows change, and the save lands the user back on the run page where both are
 * on screen. So it goes through `commandTransaction`, which applies the
 * inspection and the closed stop together and takes them back together. The
 * route this replaces applied only the inspection and left the stop reading as
 * open until the write streamed back.
 *
 * ## An edit is up to two commands
 *
 * `updateInspectionFieldDetails` takes the whole result — date, inspector, wet,
 * dips, density, larvae, life stages — because an inspection *is* its result and
 * the domain validates the set against the agency's entry policy as a unit. The
 * ad hoc placement is a different builder that ignores all of it. So a save that
 * corrected the dip count and moved the point names both, as one write.
 *
 * A habitat inspection has no location command at all: its geometry is the
 * habitat's, and moving it means editing the habitat.
 *
 * ## The centroid is stated, not left blank
 *
 * `lat`/`lng`/`geom_type` are snapshotted server-side at commit — from the drawn
 * shape for an ad hoc inspection, from the habitat for the other two. The
 * optimistic row states the same centroid anyway, computed from the shape the
 * form is already showing, so a map card drawn from the new row lands in the
 * right place instead of nowhere. The trigger overwrites all three when the row
 * syncs back.
 */

import type { MultiRowCommandType } from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { type Inspection, type LarvalDensity, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { assignment_items } from '../../lib/collections/assignment_items';
import { inspections } from '../../lib/collections/inspections';
import { mutateCollection } from '../../lib/collections/mutate';
import { commandTransaction } from '../../lib/collections/transact';
import type { StopAcknowledgements } from '../../lib/stop-acknowledgements';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { lifecycleStamp, optimisticStamp } from './shared';

/** Where an inspection sits, once its shape has been reduced to a point. */
export interface InspectionCentroid {
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
}

/** What the inspector found. The domain validates the set against the agency's policy. */
export interface InspectionResult {
	/** `YYYY-MM-DD` — the operational date, not a timestamp. */
	readonly inspectionDate: string;
	readonly inspectedByProfileId: string | null;
	readonly isWet: boolean;
	readonly dipCount: number | null;
	readonly density: LarvalDensity | null;
	readonly larvaeCount: number | null;
	readonly hasEggs: boolean;
	readonly hasFirstInstar: boolean;
	readonly hasSecondInstar: boolean;
	readonly hasThirdInstar: boolean;
	readonly hasFourthInstar: boolean;
	readonly hasPupae: boolean;
}

/**
 * Which of the three recordings this is.
 *
 * `stop` carries its own `habitatId` as nullable because the stop already names
 * one, so the ordinary call sends none and cannot disagree with it.
 */
export type InspectionPlacement =
	| { readonly kind: 'habitat'; readonly habitatId: string }
	| {
			readonly kind: 'stop';
			readonly assignmentItemId: string;
			readonly habitatId: string | null;
	  }
	| {
			readonly kind: 'adhoc';
			readonly geometry: GeoJsonGeometry;
			readonly addressId: string | null;
			readonly habitatTypeId: string | null;
	  };

/** The ad hoc placement as an edit may restate it. */
export interface AdHocPlacement {
	/** Absent when the shape was not redrawn — absent means "leave it". */
	readonly geometry: GeoJsonGeometry | null;
	readonly addressId: string | null;
	readonly habitatTypeId: string | null;
}

export interface InspectionMutations {
	readonly record: (input: {
		readonly inspectionId: string;
		readonly result: InspectionResult;
		readonly placement: InspectionPlacement;
		readonly centroid: InspectionCentroid;
		/** Only the stop placement can be refused over something a flag can answer. */
		readonly acknowledgements?: StopAcknowledgements;
	}) => Promise<void>;
	/**
	 * Save an edited inspection.
	 *
	 * `adhoc` is null on a habitat inspection, which has no location command.
	 * Resolves without sending anything when nothing moved.
	 */
	readonly save: (input: {
		readonly inspectionId: string;
		readonly result: InspectionResult;
		readonly current: InspectionResult;
		readonly adhoc: { readonly next: AdHocPlacement; readonly current: AdHocPlacement } | null;
		readonly centroid: InspectionCentroid | null;
	}) => Promise<void>;
	readonly remove: (inspectionId: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useInspectionMutations(): InspectionMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const record = useCallback(
		async ({
			inspectionId,
			result,
			placement,
			centroid,
			acknowledgements,
		}: {
			readonly inspectionId: string;
			readonly result: InspectionResult;
			readonly placement: InspectionPlacement;
			readonly centroid: InspectionCentroid;
			readonly acknowledgements?: StopAcknowledgements;
		}) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}

			const now = optimisticStamp();
			const row = {
				id: inspectionId,
				organization_id: organizationId,
				lat: centroid.lat,
				lng: centroid.lng,
				geom_type: centroid.geomType,
				habitat_id: placement.kind === 'adhoc' ? null : placement.habitatId,
				habitat_type_id: placement.kind === 'adhoc' ? placement.habitatTypeId : null,
				address_id: placement.kind === 'adhoc' ? placement.addressId : null,
				assignment_item_id: placement.kind === 'stop' ? placement.assignmentItemId : null,
				...resultColumns(result),
				created_by_profile_id: actorProfileId,
				updated_by_profile_id: actorProfileId,
				created_at: now,
				updated_at: now,
				// `satisfies` rather than `as`: it is what makes a wrong column name a
				// compile error. The cast is exactly what let camelCase rows through.
			} satisfies Inspection;

			if (placement.kind === 'stop') {
				await settleWrite(
					commandTransaction({
						intent:
							'fieldWork.recordHabitatInspectionForAssignmentItem' satisfies MultiRowCommandType,
						request: {
							table: 'inspections',
							method: 'POST',
							body: stopInspectionRequestBody(row, placement, acknowledgements),
						},
						apply: () => {
							inspections.insert(row);
							// The stop the inspector was sent to, closed by the record that
							// was the reason for it. Backdated like every lifecycle stamp,
							// so a fast browser clock cannot have it refused as future.
							assignment_items.update(placement.assignmentItemId, (draft) => {
								draft.completed_at = lifecycleStamp();
								draft.completed_by_profile_id = actorProfileId;
								draft.skipped_at = null;
								draft.skipped_by_profile_id = null;
								draft.skip_reason = null;
								draft.updated_by_profile_id = actorProfileId;
								draft.updated_at = now;
							});
						},
					}),
				);
				return;
			}

			await settleWrite(
				mutateCollection(inspections, {
					operation: 'insert',
					intent:
						placement.kind === 'habitat'
							? 'larvalSurveillance.recordHabitatInspection'
							: 'larvalSurveillance.recordAdHocInspection',
					row,
					...(placement.kind === 'adhoc'
						? { locationSource: { kind: 'geometry', geometry: placement.geometry } }
						: {}),
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(
		async ({
			inspectionId,
			result,
			current,
			adhoc,
			centroid,
		}: {
			readonly inspectionId: string;
			readonly result: InspectionResult;
			readonly current: InspectionResult;
			readonly adhoc: { readonly next: AdHocPlacement; readonly current: AdHocPlacement } | null;
			readonly centroid: InspectionCentroid | null;
		}) => {
			const intents: (
				| 'larvalSurveillance.updateInspectionFieldDetails'
				| 'larvalSurveillance.updateAdHocInspectionLocation'
			)[] = [];
			const changes: Partial<Inspection> = {};

			if (resultMoved(result, current)) {
				intents.push('larvalSurveillance.updateInspectionFieldDetails');
				Object.assign(changes, resultColumns(result));
			}

			// The three ad hoc fields are read by presence on the server, where a null
			// address means "detach" and an absent one means "leave it" — so each is
			// stated only when it actually moved.
			const redrawn = adhoc !== null && adhoc.next.geometry !== null;
			const addressMoved = adhoc !== null && adhoc.next.addressId !== adhoc.current.addressId;
			const typeMoved = adhoc !== null && adhoc.next.habitatTypeId !== adhoc.current.habitatTypeId;
			if (redrawn || addressMoved || typeMoved) {
				intents.push('larvalSurveillance.updateAdHocInspectionLocation');
				if (addressMoved) {
					changes.address_id = adhoc?.next.addressId ?? null;
				}
				if (typeMoved) {
					changes.habitat_type_id = adhoc?.next.habitatTypeId ?? null;
				}
				if (redrawn && centroid !== null) {
					changes.lat = centroid.lat;
					changes.lng = centroid.lng;
					changes.geom_type = centroid.geomType;
				}
			}

			if (intents.length === 0) {
				return;
			}

			await settleWrite(
				mutateCollection(inspections, {
					operation: 'update',
					intent: intents,
					key: inspectionId,
					changes: {
						...changes,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
					// Absent unless the shape was redrawn: a geometry sent under a command
					// that has no reader for it is a key the server ignores, and sending one
					// anyway makes the body claim an edit it is not making.
					...(redrawn && adhoc?.next.geometry != null
						? { locationSource: { kind: 'geometry', geometry: adhoc.next.geometry } }
						: {}),
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(async (inspectionId: string) => {
		await settleWrite(
			mutateCollection(inspections, {
				operation: 'delete',
				intent: 'larvalSurveillance.deleteInspection',
				key: inspectionId,
			}),
		);
	}, []);

	return {
		record,
		save,
		remove,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}

/** The result, as columns. One place, because the create and the edit both send all of it. */
function resultColumns(result: InspectionResult) {
	return {
		inspection_date: result.inspectionDate,
		inspected_by_profile_id: result.inspectedByProfileId,
		is_wet: result.isWet,
		dip_count: result.dipCount,
		density: result.density,
		larvae_count: result.larvaeCount,
		has_eggs: result.hasEggs,
		has_first_instar: result.hasFirstInstar,
		has_second_instar: result.hasSecondInstar,
		has_third_instar: result.hasThirdInstar,
		has_fourth_instar: result.hasFourthInstar,
		has_pupae: result.hasPupae,
	} as const;
}

/**
 * Whether the result changed at all.
 *
 * Compared as a whole rather than field by field because the command takes it as
 * a whole: the domain validates dips, density and larvae against each other and
 * against the agency's entry policy, so sending three of the twelve would be
 * validating a result nobody recorded.
 */
function resultMoved(next: InspectionResult, current: InspectionResult): boolean {
	const a = resultColumns(next);
	const b = resultColumns(current);
	return (Object.keys(a) as (keyof typeof a)[]).some((key) => a[key] !== b[key]);
}

/**
 * The body a stop-recorded inspection sends.
 *
 * Exported because this is the one write in the app whose body is hand-built
 * rather than diffed out of a mutation — `commandTransaction` sends what it is
 * given, where `mutateCollection` derives the body through `commandRequestFor`.
 * That makes it the one place a missing `assignment_item_id` could go quiet: the
 * server would take the non-execution branch, answer 201, and sync would revert
 * the optimistic link a moment later, with nothing thrown and nothing to see.
 * See `docs/adr/0012-assignment-item-action-provenance.md`.
 */
export function stopInspectionRequestBody(
	row: Inspection,
	placement: { readonly assignmentItemId: string; readonly habitatId: string | null },
	acknowledgements?: StopAcknowledgements,
): Record<string, unknown> {
	return {
		...requestColumns(row),
		assignment_item_id: placement.assignmentItemId,
		// Nullable: the stop already names a habitat, so the ordinary call sends
		// none and cannot disagree with it.
		habitat_id: placement.habitatId,
		...acknowledgements,
	};
}

/**
 * The row as the request states it.
 *
 * The columns the server never reads back are dropped — the centroid is
 * snapshotted from the habitat at commit, and the stamps are the server's own.
 */
function requestColumns(row: Inspection) {
	const {
		lat: _lat,
		lng: _lng,
		geom_type: _geomType,
		organization_id: _organizationId,
		created_by_profile_id: _createdBy,
		updated_by_profile_id: _updatedBy,
		created_at: _createdAt,
		updated_at: _updatedAt,
		...rest
	} = row;
	return rest;
}

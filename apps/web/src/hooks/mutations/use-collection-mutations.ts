/**
 * Setting a trap, emptying one, correcting the record, and its three flags.
 *
 * The largest write seam in the app, because the table it writes is the one the
 * server was inferring the most about. `buildCollectionCreateCommand` read a
 * POST body three levels deep: an `assignmentItemId` chose the stop-execution
 * pair, a `trapId` chose the trap pair, neither chose the ad hoc pair, and
 * *inside* each pair a `collectedAt` that happened to parse chose between
 * setting the trap and recording it already emptied. Six commands, none of them
 * named — and a visit that was meant to leave a trap out became a completed
 * record if a stray `collectedAt` rode along.
 *
 * {@link CollectionPlacement} states which of the three a create is, and
 * `isCollected` states whether the trap has been emptied. Both are answers the
 * form already has.
 *
 * ## A trap set and a trap emptied are two visits
 *
 * Often days apart, and between them the collection exists with no specimens
 * against it. {@link CollectionMutations.collect} is that second visit. It is
 * its own command rather than an edit, because only that command can also close
 * the assignment stop the technician was sent on — which is also why it is the
 * one operation here that is single-row or multi-row depending on where it was
 * called from.
 *
 * The transport it replaces had to work this out by hand: `isCollectOnly`
 * compared fifteen columns to decide whether an ordinary PATCH was really the
 * Collect action in disguise, and routed it to a different endpoint when it
 * was. The caller knew all along.
 *
 * ## An edit is up to two commands
 *
 * `updateCollectionFieldDetails` takes the timing, who set and collected it, the
 * problem flag and the custom fields. `updateAdHocCollectionConfiguration` takes
 * the method, the lure, the address and the point. The second is named for the
 * ad hoc case it was written for, and the route being replaced named it for a
 * trap collection too whenever the method or lure moved — the writer sets the
 * columns either way, so that is preserved here rather than narrowed.
 *
 * The six timing columns move as one, because a collection is either exactly
 * timestamped or dated with a duration and half of each is not a state the row
 * can hold. So a change to any of them resends all six.
 *
 * ## The three flags are three different things
 *
 * The page shows them as one group of switches, and the route this replaces
 * wrote them through one draft-mutating callback keyed by column name. They are
 * not one operation:
 *
 * - Zero result is a pair read for its direction. Marking it *clears every
 *   species count on the collection* and clearing it does not put them back, so
 *   `markCollectionZeroResult` and `clearCollectionZeroResult` are separate
 *   commands and the destructive one is the only one the page confirms.
 * - Bycatch is an observation, so the value is the point and one command takes
 *   it either way.
 * - Problem is part of the field record, so it rides on
 *   `updateCollectionFieldDetails` with everything else the crew reported.
 */

import type { MultiRowCommandType, SingleRowCommandType } from '@simmer-mosquito/domain';
import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { type AdultCollection, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { assignment_items } from '../../lib/collections/assignment_items';
import { collections } from '../../lib/collections/collections';
import { mutateCollection } from '../../lib/collections/mutate';
import { commandTransaction } from '../../lib/collections/transact';
import type { StopAcknowledgements } from '../../lib/stop-acknowledgements';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { lifecycleStamp, optimisticStamp } from './shared';

/** How long the trap was out, in whichever of the two shapes the agency records. */
export interface CollectionTiming {
	readonly timingMode: 'exact_timestamps' | 'collection_date_duration';
	/** Exact mode: when the trap went out. */
	readonly startedAt: Date | null;
	/** Exact mode: when it was emptied. `null` on a trap still out. */
	readonly collectedAt: Date | null;
	/** Date+duration mode: the day it is filed under, `YYYY-MM-DD`. */
	readonly collectionDate: string | null;
	readonly durationAmount: number | null;
	readonly durationUnitId: string | null;
}

/** A collection as its form holds one, minus where it came from. */
export interface CollectionFields {
	readonly collectionMethodId: string;
	/** `null` when the trap ran unbaited. */
	readonly collectionLureId: string | null;
	/** Ad hoc only — a trap collection takes the trap's. */
	readonly addressId: string | null;
	readonly timing: CollectionTiming;
	readonly setByProfileId: string | null;
	readonly collectedByProfileId: string | null;
	readonly hasProblem: boolean;
	/** Values for the custom fields the collection method declares. */
	readonly metadata: unknown;
}

/**
 * Which of the three recordings this is.
 *
 * `stop` carries its own `trapId` as nullable because the stop already names a
 * trap, so the ordinary call sends none and cannot disagree with it.
 */
export type CollectionPlacement =
	| { readonly kind: 'trap'; readonly trapId: string }
	| {
			readonly kind: 'stop';
			readonly assignmentItemId: string;
			readonly trapId: string | null;
	  }
	| {
			readonly kind: 'adhoc';
			readonly geometry: GeoJsonGeometry;
	  };

/** Where a collection sits, as the form holds it before the row is built. */
export interface CollectionCentroid {
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
}

export interface CollectionMutations {
	readonly record: (input: {
		readonly collectionId: string;
		readonly fields: CollectionFields;
		readonly placement: CollectionPlacement;
		readonly centroid: CollectionCentroid;
		/** Whether the trap has already been emptied, or is being left out. */
		readonly isCollected: boolean;
		/** Only the stop placement can be refused over something a flag can answer. */
		readonly acknowledgements?: StopAcknowledgements;
	}) => Promise<void>;
	/**
	 * Save an edited collection.
	 *
	 * `geometry` is null when the point was not redrawn, and always null on a trap
	 * collection, which has no point of its own.
	 *
	 * Resolves without sending anything when nothing moved.
	 */
	readonly save: (input: {
		readonly collectionId: string;
		readonly fields: CollectionFields;
		readonly current: CollectionFields;
		readonly geometry: {
			readonly geometry: GeoJsonGeometry;
			readonly centroid: CollectionCentroid;
		} | null;
	}) => Promise<void>;
	/** The second visit: the trap is emptied, and the stop it came from closes with it. */
	readonly collect: (input: {
		readonly collectionId: string;
		readonly collectedAt: Date;
		/** Set when the trap was emptied off an assignment stop. */
		readonly assignmentItemId?: string | null;
		readonly acknowledgements?: StopAcknowledgements;
	}) => Promise<void>;
	/** Nothing was caught. Marking it clears every species count — two commands, not a column. */
	readonly setZeroResult: (collectionId: string, isZeroResult: boolean) => Promise<void>;
	/** Non-target specimens were present. An observation, so one command either way. */
	readonly setBycatch: (collectionId: string, hasBycatch: boolean) => Promise<void>;
	/** Trap failure, tampering, or a compromised sample — part of the field record. */
	readonly setProblem: (collectionId: string, hasProblem: boolean) => Promise<void>;
	readonly remove: (collectionId: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useCollectionMutations(): CollectionMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const record = useCallback(
		async ({
			collectionId,
			fields,
			placement,
			centroid,
			isCollected,
			acknowledgements,
		}: {
			readonly collectionId: string;
			readonly fields: CollectionFields;
			readonly placement: CollectionPlacement;
			readonly centroid: CollectionCentroid;
			readonly isCollected: boolean;
			readonly acknowledgements?: StopAcknowledgements;
		}) => {
			if (organizationId === null) {
				throw new Error('Organization details are still loading.');
			}

			const now = optimisticStamp();
			const row = {
				id: collectionId,
				organization_id: organizationId,
				lat: centroid.lat,
				lng: centroid.lng,
				geom_type: centroid.geomType,
				trap_id: placement.kind === 'adhoc' ? null : placement.trapId,
				collection_method_id: fields.collectionMethodId,
				collection_lure_id: fields.collectionLureId,
				address_id: placement.kind === 'adhoc' ? fields.addressId : null,
				...timingColumns(fields.timing),
				set_by_profile_id: fields.setByProfileId,
				collected_by_profile_id: fields.collectedByProfileId,
				// One visit, so the same stop is claimed for both halves and the server
				// decides which of the two columns it lands in — the collected one only
				// once there is something collected to attribute.
				set_assignment_item_id: placement.kind === 'stop' ? placement.assignmentItemId : null,
				collected_assignment_item_id:
					placement.kind === 'stop' && isCollected ? placement.assignmentItemId : null,
				has_problem: fields.hasProblem,
				is_zero_result: false,
				has_bycatch: false,
				metadata: fields.metadata ?? null,
				created_by_profile_id: actorProfileId,
				updated_by_profile_id: actorProfileId,
				created_at: now,
				updated_at: now,
				// `satisfies` rather than `as`: it is what makes a wrong column name a
				// compile error. The cast is exactly what let camelCase rows through.
			} satisfies AdultCollection;

			if (placement.kind === 'stop') {
				await settleWrite(
					commandTransaction({
						intent: (isCollected
							? 'fieldWork.recordCollectedTrapCollectionForAssignmentItem'
							: 'fieldWork.setTrapCollectionForAssignmentItem') satisfies MultiRowCommandType,
						request: {
							table: 'collections',
							method: 'POST',
							body: stopCollectionRequestBody(row, placement, acknowledgements),
						},
						apply: () => {
							collections.insert(row);
							// The stop the technician was sent to, closed by the visit that
							// was the reason for it. Backdated like every lifecycle stamp, so
							// a fast browser clock cannot have it refused as future.
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
				mutateCollection(collections, {
					operation: 'insert',
					intent: createIntentFor(placement.kind, isCollected),
					row,
					...(placement.kind === 'adhoc'
						? { locationSource: { kind: 'geometry', geometry: placement.geometry } }
						: {}),
					...(acknowledgements === undefined ? {} : { acknowledgements }),
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(
		async ({
			collectionId,
			fields,
			current,
			geometry,
		}: {
			readonly collectionId: string;
			readonly fields: CollectionFields;
			readonly current: CollectionFields;
			readonly geometry: {
				readonly geometry: GeoJsonGeometry;
				readonly centroid: CollectionCentroid;
			} | null;
		}) => {
			const intents: SingleRowCommandType[] = [];
			const changes: Partial<AdultCollection> = {};

			if (
				timingMoved(fields.timing, current.timing) ||
				fields.setByProfileId !== current.setByProfileId ||
				fields.collectedByProfileId !== current.collectedByProfileId ||
				fields.hasProblem !== current.hasProblem ||
				metadataChanged(current.metadata, fields.metadata)
			) {
				intents.push('adultSurveillance.updateCollectionFieldDetails');
				Object.assign(changes, timingColumns(fields.timing));
				changes.set_by_profile_id = fields.setByProfileId;
				changes.collected_by_profile_id = fields.collectedByProfileId;
				changes.has_problem = fields.hasProblem;
				changes.metadata = fields.metadata ?? null;
			}

			if (
				geometry !== null ||
				fields.collectionMethodId !== current.collectionMethodId ||
				fields.collectionLureId !== current.collectionLureId ||
				fields.addressId !== current.addressId
			) {
				intents.push('adultSurveillance.updateAdHocCollectionConfiguration');
				changes.collection_method_id = fields.collectionMethodId;
				changes.collection_lure_id = fields.collectionLureId;
				changes.address_id = fields.addressId;
				if (geometry !== null) {
					changes.lat = geometry.centroid.lat;
					changes.lng = geometry.centroid.lng;
					changes.geom_type = geometry.centroid.geomType;
				}
			}

			if (intents.length === 0) {
				return;
			}

			await settleWrite(
				mutateCollection(collections, {
					operation: 'update',
					intent: intents,
					key: collectionId,
					changes: {
						...changes,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
					...(geometry === null
						? {}
						: { locationSource: { kind: 'geometry', geometry: geometry.geometry } }),
				}),
			);
		},
		[actorProfileId],
	);

	const collect = useCallback(
		async ({
			collectionId,
			collectedAt,
			assignmentItemId,
			acknowledgements,
		}: {
			readonly collectionId: string;
			readonly collectedAt: Date;
			readonly assignmentItemId?: string | null;
			readonly acknowledgements?: StopAcknowledgements;
		}) => {
			const now = optimisticStamp();
			const changes = {
				collected_at: collectedAt,
				collected_by_profile_id: actorProfileId,
				updated_by_profile_id: actorProfileId,
				updated_at: now,
			} satisfies Partial<AdultCollection>;

			if (assignmentItemId == null) {
				await settleWrite(
					mutateCollection(collections, {
						operation: 'update',
						intent: 'adultSurveillance.collectCollection',
						key: collectionId,
						changes,
						...(acknowledgements === undefined ? {} : { acknowledgements }),
					}),
				);
				return;
			}

			await settleWrite(
				commandTransaction({
					intent: 'fieldWork.collectTrapCollectionForAssignmentItem' satisfies MultiRowCommandType,
					request: {
						table: 'collections',
						method: 'PATCH',
						key: collectionId,
						body: stopCollectRequestBody(
							{ collectedAt, collectedByProfileId: actorProfileId, assignmentItemId },
							acknowledgements,
						),
					},
					apply: () => {
						collections.update(collectionId, (draft) => {
							Object.assign(draft, changes);
							draft.collected_assignment_item_id = assignmentItemId;
						});
						assignment_items.update(assignmentItemId, (draft) => {
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
		},
		[actorProfileId],
	);

	const setZeroResult = useCallback(
		async (collectionId: string, isZeroResult: boolean) => {
			await settleWrite(
				mutateCollection(collections, {
					operation: 'update',
					intent: isZeroResult
						? 'adultSurveillance.markCollectionZeroResult'
						: 'adultSurveillance.clearCollectionZeroResult',
					key: collectionId,
					changes: {
						is_zero_result: isZeroResult,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const setBycatch = useCallback(
		async (collectionId: string, hasBycatch: boolean) => {
			await settleWrite(
				mutateCollection(collections, {
					operation: 'update',
					intent: 'adultSurveillance.setCollectionBycatch',
					key: collectionId,
					changes: {
						has_bycatch: hasBycatch,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const setProblem = useCallback(
		async (collectionId: string, hasProblem: boolean) => {
			await settleWrite(
				mutateCollection(collections, {
					operation: 'update',
					intent: 'adultSurveillance.updateCollectionFieldDetails',
					key: collectionId,
					changes: {
						has_problem: hasProblem,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(async (collectionId: string) => {
		await settleWrite(
			mutateCollection(collections, {
				operation: 'delete',
				intent: 'adultSurveillance.deleteCollection',
				key: collectionId,
			}),
		);
	}, []);

	return {
		record,
		save,
		collect,
		setZeroResult,
		setBycatch,
		setProblem,
		remove,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}

/** Which of the four ordinary creates this is — the two axes the server used to guess. */
function createIntentFor(kind: 'trap' | 'adhoc', isCollected: boolean): SingleRowCommandType {
	if (kind === 'trap') {
		return isCollected
			? 'adultSurveillance.recordCollectedTrapCollection'
			: 'adultSurveillance.setTrapCollection';
	}
	return isCollected
		? 'adultSurveillance.recordCollectedAdHocCollection'
		: 'adultSurveillance.setAdHocCollection';
}

/**
 * The body a stop-recorded collection sends.
 *
 * Exported for the same reason `stopInspectionRequestBody` is: a stop recording
 * is a multi-row command, so it goes through `commandTransaction`, which sends
 * the body it is handed rather than deriving one through `commandRequestFor`.
 * That makes this the one place a missing `assignmentItemId` could go quiet —
 * the server would take the non-execution branch, answer 201, and sync would
 * revert the optimistic completion a moment later, with nothing thrown.
 *
 * Built by naming the keys rather than by subtracting from the row, because
 * `collections` is the table where the two are furthest apart: the centroid is
 * snapshotted from the trap, the stamps are the server's, the two flags start
 * false, and *which* assignment column the stop lands in is the command's answer
 * rather than the caller's. `assignmentItemId` is camelCase because it names no
 * column — there are two columns it could become.
 *
 * See `docs/adr/0012-assignment-item-action-provenance.md`.
 */
export function stopCollectionRequestBody(
	row: AdultCollection,
	placement: { readonly assignmentItemId: string; readonly trapId: string | null },
	acknowledgements?: StopAcknowledgements,
): Record<string, unknown> {
	return {
		id: row.id,
		assignmentItemId: placement.assignmentItemId,
		// Nullable: the stop already names a trap, so the ordinary call sends none
		// and the writer falls back to the trap's own method and lure.
		trap_id: placement.trapId,
		collection_method_id: row.collection_method_id,
		collection_lure_id: row.collection_lure_id,
		collection_timing_mode: row.collection_timing_mode,
		started_at: row.started_at,
		collected_at: row.collected_at,
		collection_date: row.collection_date,
		duration_amount: row.duration_amount,
		duration_unit_id: row.duration_unit_id,
		set_by_profile_id: row.set_by_profile_id,
		collected_by_profile_id: row.collected_by_profile_id,
		has_problem: row.has_problem,
		metadata: row.metadata,
		...acknowledgements,
	};
}

/**
 * The body emptying a trap off an assignment stop sends.
 *
 * The third hand-built body in the app, and here for the reason the other two
 * are: `commandTransaction` sends what it is handed. Without `assignmentItemId`
 * the server takes the ordinary-collect branch, answers 200, and the stop this
 * visit was dispatched for stays open — the optimistic completion is reverted by
 * sync a moment later with nothing thrown.
 *
 * `collectTrapCollectionForAssignmentItem` takes only when the trap was emptied
 * and by whom. The collection already exists — it was set on an earlier visit —
 * so there is no trap and no timing to restate.
 */
export function stopCollectRequestBody(
	visit: {
		readonly collectedAt: Date;
		readonly collectedByProfileId: string | null;
		readonly assignmentItemId: string;
	},
	acknowledgements?: StopAcknowledgements,
): Record<string, unknown> {
	return {
		collected_at: visit.collectedAt,
		collected_by_profile_id: visit.collectedByProfileId,
		assignmentItemId: visit.assignmentItemId,
		...acknowledgements,
	};
}

/** The six columns that between them say how long the trap was out. */
function timingColumns(timing: CollectionTiming) {
	return {
		collection_timing_mode: timing.timingMode,
		started_at: timing.startedAt,
		collected_at: timing.collectedAt,
		collection_date: timing.collectionDate,
		duration_amount: timing.durationAmount,
		duration_unit_id: timing.durationUnitId,
	} satisfies Partial<AdultCollection>;
}

/**
 * Whether any of the six moved.
 *
 * All six or none, because a collection is either exactly timestamped or dated
 * with a duration, and the server rebuilds a whole `CollectionTiming` from them —
 * half of one mode and half of the other is not a state the row can hold.
 * The two instants compare by value: they are rebuilt on every save.
 */
function timingMoved(next: CollectionTiming, current: CollectionTiming): boolean {
	return (
		next.timingMode !== current.timingMode ||
		next.startedAt?.getTime() !== current.startedAt?.getTime() ||
		next.collectedAt?.getTime() !== current.collectedAt?.getTime() ||
		next.collectionDate !== current.collectionDate ||
		next.durationAmount !== current.durationAmount ||
		next.durationUnitId !== current.durationUnitId
	);
}

/**
 * Whether the custom fields differ.
 *
 * Compared by serialization because `metadata` is an opaque object the form
 * rebuilds on every render — a reference check would name the field-details
 * command on every save, including the ones that changed only the method.
 */
function metadataChanged(before: unknown, after: unknown): boolean {
	return JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
}

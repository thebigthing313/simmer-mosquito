/**
 * One stop on a mission: added, dropped, worked, or passed over.
 *
 * ## Two adds, because there are two things a stop can be
 *
 * A stop is either ground somebody drew, or a Requested Control Action being
 * scheduled. The old endpoint told them apart by looking — a request id and no
 * location meant the second — so "this request, but treat *this* ground instead"
 * was a thing the wire could not say. {@link MissionItemMutations.addFromRequest}
 * and {@link MissionItemMutations.addAtGeometry} say which, and the server takes
 * the stop's geometry from the request or from the shape accordingly.
 *
 * A stop owns its geometry outright, unlike an assignment stop, which points at
 * a Trap or a Habitat. The centroid written on the optimistic row is only so the
 * new pin appears before the shape round-trips — the server recomputes `geom`
 * from the location source, and `geom` never syncs.
 *
 * ## Done and Skipped name their transition
 *
 * Four commands rather than two nullable columns read for which way they moved.
 * The old endpoint checked `skipped_at` before `completed_at`, so a skipped stop
 * that was then completed was recorded as a skip — the work was done and the row
 * said it was passed over. That is why the run page could only offer Unskip on a
 * skipped stop, and why offering Complete there is now a display choice rather
 * than a fence.
 *
 * Both closes carry `autoStartMission`: a crew's first record of the day starts
 * the mission rather than being refused for a mission nobody pressed Start on.
 *
 * The `*_by_profile_id` columns are mirrored optimistically so the row does not
 * flicker between what the page wrote and what the server stamped. They do reach
 * the wire — `withoutServerOwnedColumns` strips the tenant, the centroid and the
 * four audit columns, and these are none of those — and the server ignores them,
 * because a builder reads the fields it takes and the actor is one it takes from
 * the session rather than from the body.
 *
 * Reordering is not here: it restacks the worklist and is a command on
 * the mission, in `use-mission-mutations.ts`.
 */

import type { GeoJsonGeometry } from '@simmer-mosquito/mapping';
import { ownedCentroidFromGeoJson } from '@simmer-mosquito/mapping';
import { type MissionItem as MissionItemRow, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { mission_items } from '../../lib/collections/mission_items';
import { mutateCollection } from '../../lib/collections/mutate';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { lifecycleStamp, newRecordId, optimisticStamp } from './shared';

/** What a request contributes to the stop drawn off it, before the server answers. */
export interface RequestStopSeed {
	readonly requestedControlActionId: string;
	readonly lat: number;
	readonly lng: number;
	readonly geomType: string;
}

export interface MissionItemMutations {
	readonly addFromRequest: (input: {
		readonly missionId: string;
		readonly request: RequestStopSeed;
		/** The list's current last, plus one, which is what the server's append writes. */
		readonly position: number;
	}) => Promise<void>;
	readonly addAtGeometry: (input: {
		readonly missionId: string;
		readonly geometry: GeoJsonGeometry;
		/** A label for the stop, not its location: the drawn shape is still what is stored. */
		readonly addressId: string | null;
		readonly position: number;
	}) => Promise<void>;
	readonly removeStop: (missionItemId: string) => Promise<void>;
	readonly complete: (missionItemId: string) => Promise<void>;
	readonly reopen: (missionItemId: string) => Promise<void>;
	/** The reason is required: a stop passed over silently is a hole in the day's record. */
	readonly skip: (missionItemId: string, skipReason: string) => Promise<void>;
	readonly unskip: (missionItemId: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useMissionItemMutations(): MissionItemMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const newStopRow = useCallback(
		(input: {
			readonly missionId: string;
			readonly lat: number;
			readonly lng: number;
			readonly geomType: string;
			readonly requestedControlActionId: string | null;
			readonly addressId: string | null;
			readonly position: number;
		}): MissionItemRow => {
			const now = optimisticStamp();
			return {
				id: newRecordId(),
				organization_id: organizationId ?? '',
				mission_id: input.missionId,
				requested_control_action_id: input.requestedControlActionId,
				lat: input.lat,
				lng: input.lng,
				geom_type: input.geomType,
				address_id: input.addressId,
				position: input.position,
				completed_at: null,
				completed_by_profile_id: null,
				skipped_at: null,
				skipped_by_profile_id: null,
				skip_reason: null,
				created_by_profile_id: actorProfileId,
				updated_by_profile_id: actorProfileId,
				created_at: now,
				updated_at: now,
			};
		},
		[organizationId, actorProfileId],
	);

	const addFromRequest = useCallback(
		async ({
			missionId,
			request,
			position,
		}: {
			readonly missionId: string;
			readonly request: RequestStopSeed;
			readonly position: number;
		}) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}

			await settleWrite(
				mutateCollection(mission_items(), {
					operation: 'insert',
					intent: 'missionDispatch.addMissionItemFromRequestedControlAction',
					// No location source: the command names where the ground comes from,
					// and the server reads it off the request inside the transaction. The
					// centroid copied onto the row is only so the pin appears now.
					row: newStopRow({
						missionId,
						lat: request.lat,
						lng: request.lng,
						geomType: request.geomType,
						requestedControlActionId: request.requestedControlActionId,
						addressId: null,
						position,
					}),
				}),
			);
		},
		[organizationId, newStopRow],
	);

	const addAtGeometry = useCallback(
		async ({
			missionId,
			geometry,
			addressId,
			position,
		}: {
			readonly missionId: string;
			readonly geometry: GeoJsonGeometry;
			readonly addressId: string | null;
			readonly position: number;
		}) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}

			const centroid = ownedCentroidFromGeoJson(geometry);
			if (centroid === null) {
				throw new Error('Unable to determine where this stop is.');
			}

			await settleWrite(
				mutateCollection(mission_items(), {
					operation: 'insert',
					intent: 'missionDispatch.addMissionItem',
					row: newStopRow({
						missionId,
						lat: centroid.lat,
						lng: centroid.lng,
						geomType: centroid.geomType,
						requestedControlActionId: null,
						addressId,
						position,
					}),
					locationSource: { kind: 'geometry', geometry },
				}),
			);
		},
		[organizationId, newStopRow],
	);

	const removeStop = useCallback(async (missionItemId: string) => {
		await settleWrite(
			mutateCollection(mission_items(), {
				operation: 'delete',
				intent: 'missionDispatch.removeMissionItem',
				key: missionItemId,
			}),
		);
	}, []);

	const complete = useCallback(
		async (missionItemId: string) => {
			await settleWrite(
				mutateCollection(mission_items(), {
					operation: 'update',
					intent: 'missionDispatch.completeMissionItem',
					key: missionItemId,
					// The skip columns are cleared here as well as server-side: completing
					// a stop that had been skipped is a legal path, and leaving the reason
					// on the row would render it as still skipped.
					changes: {
						completed_at: lifecycleStamp(),
						completed_by_profile_id: actorProfileId,
						skipped_at: null,
						skipped_by_profile_id: null,
						skip_reason: null,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
					arguments: { autoStartMission: true },
				}),
			);
		},
		[actorProfileId],
	);

	const reopen = useCallback(
		async (missionItemId: string) => {
			await settleWrite(
				mutateCollection(mission_items(), {
					operation: 'update',
					intent: 'missionDispatch.reopenMissionItem',
					key: missionItemId,
					changes: {
						completed_at: null,
						completed_by_profile_id: null,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const skip = useCallback(
		async (missionItemId: string, skipReason: string) => {
			await settleWrite(
				mutateCollection(mission_items(), {
					operation: 'update',
					intent: 'missionDispatch.skipMissionItem',
					key: missionItemId,
					changes: {
						skipped_at: lifecycleStamp(),
						skipped_by_profile_id: actorProfileId,
						skip_reason: skipReason,
						completed_at: null,
						completed_by_profile_id: null,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
					arguments: { autoStartMission: true },
				}),
			);
		},
		[actorProfileId],
	);

	const unskip = useCallback(
		async (missionItemId: string) => {
			await settleWrite(
				mutateCollection(mission_items(), {
					operation: 'update',
					intent: 'missionDispatch.unskipMissionItem',
					key: missionItemId,
					changes: {
						skipped_at: null,
						skipped_by_profile_id: null,
						skip_reason: null,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	return {
		addFromRequest,
		addAtGeometry,
		removeStop,
		complete,
		reopen,
		skip,
		unskip,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}

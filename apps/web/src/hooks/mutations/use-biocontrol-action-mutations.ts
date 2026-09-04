/**
 * Recording, correcting and removing a biocontrol release.
 *
 * The same three writes as a source reduction, over a record that measures an
 * organism put out rather than sources taken away. What the two share — which
 * command a save means, and how a larval context is stated — lives in
 * `performed-action-writes.ts`; what stays here is this table's columns, so a
 * wrong one is a compile error rather than a lookup that silently misses.
 *
 * Read `use-source-reduction-mutations.ts` for the reasoning behind the intent
 * split and the mission-stop fork; both apply here unchanged.
 */

import { type BiocontrolAction as BiocontrolActionRow, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import type { StopAcknowledgements } from '../../lib/acknowledgements';
import { biocontrol_actions } from '../../lib/collections/biocontrol_actions';
import { mutateCollection } from '../../lib/collections/mutate';
import type { BiocontrolAction } from '../queries/control-action-view';
import { useAuthSnapshot } from '../use-auth-snapshot';
import {
	type ActionLocation,
	actionEditIntents,
	contextFor,
	metadataChanged,
} from './performed-action-writes';
import { optimisticStamp } from './shared';

/** What a biocontrol form collects, in the vocabulary the page speaks. */
export interface BiocontrolActionValues {
	readonly methodId: string;
	/** `null` when the crew recorded no lead technician. */
	readonly technicianProfileId: string | null;
	/** `YYYY-MM-DD` — the operational date, not a timestamp. */
	readonly actionDate: string;
	/** Reference only; the action's own geometry is its authoritative location. */
	readonly addressId: string | null;
	/** The Habitat the organism was released into, if any. */
	readonly habitatId: string | null;
	readonly amountReleased: number;
	readonly unitId: string;
	readonly metadata: unknown;
}

export interface RecordBiocontrolActionInput {
	/** Minted by the caller — see `newRecordId` in `shared.ts` for why. */
	readonly biocontrolActionId: string;
	readonly values: BiocontrolActionValues;
	readonly location: ActionLocation;
	/** Set when the release was recorded against a mission stop. */
	readonly missionItemId: string | null;
	readonly acknowledgements?: StopAcknowledgements;
}

export interface UpdateBiocontrolActionInput {
	readonly values: BiocontrolActionValues;
	/** Only when the user moved the shape this session. */
	readonly location?: ActionLocation;
	readonly acknowledgements?: StopAcknowledgements;
}

export interface BiocontrolActionMutations {
	readonly record: (input: RecordBiocontrolActionInput) => Promise<void>;
	readonly update: (current: BiocontrolAction, input: UpdateBiocontrolActionInput) => Promise<void>;
	/**
	 * Delete a biocontrol release.
	 *
	 * `acknowledgements` is what the user answered. Withheld flags go on the wire
	 * as `false`, which is the only reading that makes the registry refuse.
	 */
	readonly remove: (
		biocontrolActionId: string,
		acknowledgements?: Readonly<Record<string, boolean>>,
	) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useBiocontrolActionMutations(): BiocontrolActionMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const record = useCallback(
		async ({
			biocontrolActionId,
			values,
			location,
			missionItemId,
			acknowledgements,
		}: RecordBiocontrolActionInput) => {
			if (organizationId === null || actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}
			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(biocontrol_actions(), {
					operation: 'insert',
					intent:
						missionItemId === null
							? 'controlOperations.recordBiocontrolAction'
							: 'missionDispatch.recordBiocontrolActionForMissionItem',
					row: {
						id: biocontrolActionId,
						organization_id: organizationId,
						biocontrol_method_id: values.methodId,
						technician_profile_id: values.technicianProfileId,
						biocontrol_date: values.actionDate,
						lat: location.lat,
						lng: location.lng,
						geom_type: location.geomType,
						address_id: values.addressId,
						habitat_id: values.habitatId,
						inspection_id: null,
						amount_released: values.amountReleased,
						release_unit_id: values.unitId,
						requested_control_action_id: null,
						mission_item_id: missionItemId,
						metadata: values.metadata,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies BiocontrolActionRow,
					...(location.locationSource === undefined
						? {}
						: { locationSource: location.locationSource }),
					context: contextFor(values.habitatId, null),
					...(acknowledgements === undefined ? {} : { acknowledgements }),
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const update = useCallback(
		async (
			current: BiocontrolAction,
			{ values, location, acknowledgements }: UpdateBiocontrolActionInput,
		) => {
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}

			const fieldsMoved =
				current.methodId !== values.methodId ||
				current.technicianProfileId !== values.technicianProfileId ||
				current.actionDate !== values.actionDate ||
				current.amountReleased !== values.amountReleased ||
				current.unitId !== values.unitId ||
				metadataChanged(current.metadata, values.metadata);

			const habitatMoved = current.habitatId !== values.habitatId;
			const addressMoved = current.addressId !== values.addressId;
			const placementMoved = habitatMoved || addressMoved || location?.locationSource !== undefined;

			if (!fieldsMoved && !placementMoved) {
				return;
			}

			const intent = actionEditIntents({
				fieldsMoved,
				fieldsIntent: 'controlOperations.updateBiocontrolActionFieldDetails',
				placementMoved,
				placementIntent: 'controlOperations.updateBiocontrolActionLocationAndContext',
			});

			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(biocontrol_actions(), {
					operation: 'update',
					intent,
					key: current.id,
					changes: {
						...(fieldsMoved
							? {
									biocontrol_method_id: values.methodId,
									technician_profile_id: values.technicianProfileId,
									biocontrol_date: values.actionDate,
									amount_released: values.amountReleased,
									release_unit_id: values.unitId,
									metadata: values.metadata,
								}
							: {}),
						...(addressMoved ? { address_id: values.addressId } : {}),
						...(habitatMoved ? { habitat_id: values.habitatId } : {}),
						// Reseeded so the record's marker moves before the server answers. The
						// server recomputes all three from the geometry it stores.
						...(location === undefined
							? {}
							: { lat: location.lat, lng: location.lng, geom_type: location.geomType }),
						updated_by_profile_id: actorProfileId,
						updated_at: now,
					},
					...(location?.locationSource === undefined
						? {}
						: { locationSource: location.locationSource }),
					// Only when the attachment is what changed, and carrying the Inspection
					// through — see `contextFor`.
					...(habitatMoved ? { context: contextFor(values.habitatId, current.inspectionId) } : {}),
					...(acknowledgements === undefined ? {} : { acknowledgements }),
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(
		async (
			biocontrolActionId: string,
			acknowledgements: Readonly<Record<string, boolean>> = {},
		) => {
			await settleWrite(
				mutateCollection(biocontrol_actions(), {
					operation: 'delete',
					intent: 'controlOperations.deleteBiocontrolAction',
					key: biocontrolActionId,
					// A delete carries no row and no changed fields, so an acknowledgement
					// is the only thing it can say beyond the command's name.
					acknowledgements,
				}),
			);
		},
		[],
	);

	return { record, update, remove, canWrite: organizationId !== null && actorProfileId !== null };
}

/**
 * Recording, correcting and removing an outreach action.
 *
 * Outreach lives under public engagement but is written with
 * `controlOperations.*` commands, so it takes the same shape as the other
 * performed actions — see `use-source-reduction-mutations.ts` for the reasoning
 * behind the intent split and the mission-stop fork.
 *
 * ## Two ways it is not like the others
 *
 * **It reaches people, so there is no unit.** `reach` is a count of people and
 * `reach_description` says who they were; nothing here names a unit catalog.
 *
 * **It has no Habitat.** `outreach_actions` carries an `inspection_id` but no
 * `habitat_id` — a talk given at a school is not work done at a larval site — so
 * a form has no attachment to change and this hook never sends a `context` on an
 * edit. A create still states `{ kind: 'none' }` through `contextFor`, because a
 * create says what the record is rather than leaving it unsaid.
 */

import { type OutreachAction as OutreachActionRow, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import type { StopAcknowledgements } from '../../lib/acknowledgements';
import { mutateCollection } from '../../lib/collections/mutate';
import { outreach_actions } from '../../lib/collections/outreach_actions';
import type { OutreachAction } from '../queries/outreach-view';
import { useAuthSnapshot } from '../use-auth-snapshot';
import {
	type ActionLocation,
	actionEditIntents,
	contextFor,
	metadataChanged,
} from './performed-action-writes';
import { optimisticStamp } from './shared';

/** What an outreach form collects, in the vocabulary the page speaks. */
export interface OutreachActionValues {
	readonly methodId: string;
	/** `null` when nobody was recorded as leading it. */
	readonly technicianProfileId: string | null;
	/** `YYYY-MM-DD` — the operational date, not a timestamp. */
	readonly actionDate: string;
	/** Reference only; the action's own geometry is its authoritative location. */
	readonly addressId: string | null;
	/** How many people it reached. */
	readonly reach: number;
	/** Who they were. `null` when the form left it empty. */
	readonly reachDescription: string | null;
	readonly metadata: unknown;
}

export interface RecordOutreachActionInput {
	/** Minted by the caller — see `newRecordId` in `shared.ts` for why. */
	readonly outreachActionId: string;
	readonly values: OutreachActionValues;
	readonly location: ActionLocation;
	/** Set when the outreach was recorded against a mission stop. */
	readonly missionItemId: string | null;
	readonly acknowledgements?: StopAcknowledgements;
}

export interface UpdateOutreachActionInput {
	readonly values: OutreachActionValues;
	/** Only when the user moved the shape this session. */
	readonly location?: ActionLocation;
	readonly acknowledgements?: StopAcknowledgements;
}

export interface OutreachActionMutations {
	readonly record: (input: RecordOutreachActionInput) => Promise<void>;
	readonly update: (current: OutreachAction, input: UpdateOutreachActionInput) => Promise<void>;
	readonly remove: (
		outreachActionId: string,
		acknowledgements?: StopAcknowledgements,
	) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useOutreachActionMutations(): OutreachActionMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const record = useCallback(
		async ({
			outreachActionId,
			values,
			location,
			missionItemId,
			acknowledgements,
		}: RecordOutreachActionInput) => {
			if (organizationId === null || actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}
			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(outreach_actions, {
					operation: 'insert',
					intent:
						missionItemId === null
							? 'controlOperations.recordOutreachAction'
							: 'missionDispatch.recordOutreachActionForMissionItem',
					row: {
						id: outreachActionId,
						organization_id: organizationId,
						outreach_method_id: values.methodId,
						technician_profile_id: values.technicianProfileId,
						outreach_date: values.actionDate,
						lat: location.lat,
						lng: location.lng,
						geom_type: location.geomType,
						address_id: values.addressId,
						inspection_id: null,
						reach: values.reach,
						reach_description: values.reachDescription,
						requested_control_action_id: null,
						mission_item_id: missionItemId,
						metadata: values.metadata,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies OutreachActionRow,
					...(location.locationSource === undefined
						? {}
						: { locationSource: location.locationSource }),
					// No Habitat on this table, so the only context a create can state is
					// the absence of one.
					context: contextFor(null, null),
					...(acknowledgements === undefined ? {} : { acknowledgements }),
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const update = useCallback(
		async (
			current: OutreachAction,
			{ values, location, acknowledgements }: UpdateOutreachActionInput,
		) => {
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}

			const fieldsMoved =
				current.methodId !== values.methodId ||
				current.technicianProfileId !== values.technicianProfileId ||
				current.outreachDate !== values.actionDate ||
				current.reach !== values.reach ||
				current.reachDescription !== values.reachDescription ||
				metadataChanged(current.metadata, values.metadata);

			// No Habitat to move: the address and the drawn shape are the whole of this
			// record's placement.
			const addressMoved = current.addressId !== values.addressId;
			const placementMoved = addressMoved || location?.locationSource !== undefined;

			if (!fieldsMoved && !placementMoved) {
				return;
			}

			const intent = actionEditIntents(
				fieldsMoved,
				placementMoved,
				'controlOperations.updateOutreachActionFieldDetails',
				'controlOperations.updateOutreachActionLocationAndContext',
			);

			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(outreach_actions, {
					operation: 'update',
					intent,
					key: current.id,
					changes: {
						...(fieldsMoved
							? {
									outreach_method_id: values.methodId,
									technician_profile_id: values.technicianProfileId,
									outreach_date: values.actionDate,
									reach: values.reach,
									reach_description: values.reachDescription,
									metadata: values.metadata,
								}
							: {}),
						...(addressMoved ? { address_id: values.addressId } : {}),
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
					// Deliberately no `context`: nothing on this form can change the
					// Inspection, and sending one would rewrite it.
					...(acknowledgements === undefined ? {} : { acknowledgements }),
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(
		async (outreachActionId: string, acknowledgements?: StopAcknowledgements) => {
			await settleWrite(
				mutateCollection(outreach_actions, {
					operation: 'delete',
					intent: 'controlOperations.deleteOutreachAction',
					key: outreachActionId,
					...(acknowledgements === undefined ? {} : { acknowledgements }),
				}),
			);
		},
		[],
	);

	return { record, update, remove, canWrite: organizationId !== null && actorProfileId !== null };
}

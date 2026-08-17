/**
 * Recording, correcting and removing a source reduction.
 *
 * The three writes one record supports, bound to the acting Profile and Agency so
 * a form's submit handler passes only what the user typed. See `shared.ts` for
 * why this folder is hooks rather than plain functions.
 *
 * ## Four things this hook knows so the pages do not
 *
 * **A create off a mission stop is a different command.** Recording work against
 * a stop is `missionDispatch.recordSourceReductionForMissionItem`, which links
 * the action to the stop and completes it in the same transaction; recording it
 * on its own is `controlOperations.recordSourceReduction`. The presence of a
 * `missionItemId` is the whole difference, so the hook reads it rather than
 * asking a form which command it meant.
 *
 * **An edit is two commands, and which two depends on what moved.**
 * `updateSourceReductionFieldDetails` takes the date, method, amount, unit,
 * technician and custom fields. The address, the Habitat and the drawn point
 * belong to `updateSourceReductionLocationAndContext` — a different builder,
 * which the first one ignores. Naming only the first while the user changed the
 * address drops that change behind a 200; naming both when only one group moved
 * is refused, because the domain will not run a command with nothing to change.
 * So the intents are computed from a real comparison, not declared up front.
 *
 * **The context is read whole, and half a context erases the other half.**
 * `contextIds` on the server maps `{ kind: 'larval', habitatId }` onto
 * *both* `habitat_id` and `inspection_id`, so a context naming only the Habitat
 * clears the Inspection this action was recorded from. The current Inspection is
 * carried through every time one is sent.
 *
 * **The point is stated as a `locationSource` either way.** The mission command
 * takes a bare geometry override rather than a location source, but that is the
 * domain's distinction and the server unwraps it — see `drawnGeometry` in
 * `apps/server/src/table-commands/performed-actions.ts`. A form should not have
 * to know which command its save will become.
 */

import { type SourceReduction as SourceReductionRow, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { mutateCollection } from '../../lib/collections/mutate';
import { source_reductions } from '../../lib/collections/source_reductions';
import type { StopAcknowledgements } from '../../lib/stop-acknowledgements';
import type { SourceReduction } from '../queries/control-action-view';
import { useAuthSnapshot } from '../use-auth-snapshot';
import {
	type ActionLocation,
	actionEditIntents,
	contextFor,
	metadataChanged,
} from './performed-action-writes';
import { optimisticStamp } from './shared';

/** What a source reduction form collects, in the vocabulary the page speaks. */
export interface SourceReductionValues {
	readonly methodId: string;
	/** `null` when the crew recorded no lead technician. */
	readonly technicianProfileId: string | null;
	/** `YYYY-MM-DD` — the operational date, not a timestamp. */
	readonly actionDate: string;
	/** Reference only; the action's own point is its authoritative location. */
	readonly addressId: string | null;
	/** The Habitat whose breeding sources were eliminated, if any. */
	readonly habitatId: string | null;
	readonly sourcesEliminated: number;
	readonly unitId: string;
	readonly metadata: unknown;
}

export interface RecordSourceReductionInput {
	/** Minted by the caller — see `newRecordId` in `shared.ts` for why. */
	readonly sourceReductionId: string;
	readonly values: SourceReductionValues;
	readonly location: ActionLocation;
	/** Set when the work was recorded against a mission stop. */
	readonly missionItemId: string | null;
	readonly acknowledgements?: StopAcknowledgements;
}

export interface UpdateSourceReductionInput {
	readonly values: SourceReductionValues;
	/** Only when the user moved the point this session. */
	readonly location?: ActionLocation;
	readonly acknowledgements?: StopAcknowledgements;
}

export interface SourceReductionMutations {
	readonly record: (input: RecordSourceReductionInput) => Promise<void>;
	readonly update: (current: SourceReduction, input: UpdateSourceReductionInput) => Promise<void>;
	readonly remove: (
		sourceReductionId: string,
		acknowledgements?: StopAcknowledgements,
	) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useSourceReductionMutations(): SourceReductionMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const record = useCallback(
		async ({
			sourceReductionId,
			values,
			location,
			missionItemId,
			acknowledgements,
		}: RecordSourceReductionInput) => {
			if (organizationId === null || actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}
			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(source_reductions, {
					operation: 'insert',
					// The stop is what makes it the other command. Both write this table;
					// only one of them also closes the mission item.
					intent:
						missionItemId === null
							? 'controlOperations.recordSourceReduction'
							: 'missionDispatch.recordSourceReductionForMissionItem',
					row: {
						id: sourceReductionId,
						organization_id: organizationId,
						source_reduction_method_id: values.methodId,
						technician_profile_id: values.technicianProfileId,
						source_reduction_date: values.actionDate,
						lat: location.lat,
						lng: location.lng,
						geom_type: location.geomType,
						address_id: values.addressId,
						habitat_id: values.habitatId,
						sources_eliminated_amount: values.sourcesEliminated,
						sources_eliminated_unit_id: values.unitId,
						// A create never promotes an existing Inspection or requested action;
						// both are attached by the flows that own them.
						inspection_id: null,
						requested_control_action_id: null,
						mission_item_id: missionItemId,
						metadata: values.metadata,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
						// `satisfies` rather than `as`: it is what makes a wrong column name a
						// compile error. The cast is exactly what let camelCase rows through.
					} satisfies SourceReductionRow,
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
			current: SourceReduction,
			{ values, location, acknowledgements }: UpdateSourceReductionInput,
		) => {
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}

			const fieldsMoved =
				current.methodId !== values.methodId ||
				current.technicianProfileId !== values.technicianProfileId ||
				current.actionDate !== values.actionDate ||
				current.sourcesEliminated !== values.sourcesEliminated ||
				current.unitId !== values.unitId ||
				metadataChanged(current.metadata, values.metadata);

			const habitatMoved = current.habitatId !== values.habitatId;
			const addressMoved = current.addressId !== values.addressId;
			const pointMoved = location?.locationSource !== undefined;
			const placementMoved = habitatMoved || addressMoved || pointMoved;

			if (!fieldsMoved && !placementMoved) {
				return;
			}

			const intent = actionEditIntents(
				fieldsMoved,
				placementMoved,
				'controlOperations.updateSourceReductionFieldDetails',
				'controlOperations.updateSourceReductionLocationAndContext',
			);

			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(source_reductions, {
					operation: 'update',
					intent,
					key: current.id,
					changes: {
						...(fieldsMoved
							? {
									source_reduction_method_id: values.methodId,
									technician_profile_id: values.technicianProfileId,
									source_reduction_date: values.actionDate,
									sources_eliminated_amount: values.sourcesEliminated,
									sources_eliminated_unit_id: values.unitId,
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
					// Only when the attachment is what changed. Sent every time, an
					// unchanged Habitat would still rewrite the Inspection alongside it.
					...(habitatMoved ? { context: contextFor(values.habitatId, current.inspectionId) } : {}),
					...(acknowledgements === undefined ? {} : { acknowledgements }),
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(
		async (sourceReductionId: string, acknowledgements?: StopAcknowledgements) => {
			await settleWrite(
				mutateCollection(source_reductions, {
					operation: 'delete',
					intent: 'controlOperations.deleteSourceReduction',
					key: sourceReductionId,
					...(acknowledgements === undefined ? {} : { acknowledgements }),
				}),
			);
		},
		[],
	);

	return { record, update, remove, canWrite: organizationId !== null && actorProfileId !== null };
}

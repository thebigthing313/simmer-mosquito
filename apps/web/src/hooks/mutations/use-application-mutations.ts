/**
 * Recording, correcting and removing a chemical application.
 *
 * The fourth performed action, and the only one with a second table hanging off
 * it: `application_batches` records which physical lots of the product came off
 * the shelf. Everything `use-source-reduction-mutations.ts` explains — the
 * mission-stop fork, the two-command edit, the context read whole, the location
 * stated one way — applies here unchanged. What is different is the batches, and
 * they are different in each of the three writes.
 *
 * ## A create is one command, and goes through a transaction
 *
 * `recordChemicalApplication` takes its batches in its own payload and inserts
 * them alongside the application inside one Postgres transaction. It has to: a
 * link row names the application, so it cannot exist first.
 *
 * That makes this the first write in the app that one row cannot describe, so it
 * goes through `commandTransaction` rather than `mutateCollection` — one request
 * carrying the whole command, and N optimistic rows the library applies together
 * and takes back together. The alternative is what this replaces: POST the
 * application, then POST each link, and report "recorded the application but not
 * the batches" when the second half fails.
 *
 * ## An edit is not
 *
 * Adding or removing a lot afterwards is `addChemicalApplicationBatch` /
 * `removeChemicalApplicationBatch` — ordinary single-row commands against
 * `application_batches`, with their own permission rules. So {@link
 * ApplicationMutations.setBatches} is a reconcile through `mutateCollection`, and
 * it has nothing to do with the application's own edit.
 *
 * One consequence worth knowing: changing the *product* clears the links
 * server-side, because lots of the old insecticide cannot describe the new one.
 * The form already empties its batch field when the product changes, so the two
 * agree — but a caller that skipped the form would need to answer
 * `acknowledgedBatchClearance`.
 */

import {
	type ApplicationBatch as ApplicationBatchRow,
	type Application as ApplicationRow,
	commandBodyFromRow,
	settleWrite,
} from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import type { StopAcknowledgements } from '../../lib/acknowledgements';
import { application_batches } from '../../lib/collections/application_batches';
import { applications } from '../../lib/collections/applications';
import { mutateCollection } from '../../lib/collections/mutate';
import { commandTransaction } from '../../lib/collections/transact';
import { reconcileLinks } from '../../sync/reconcile-links';
import type { ChemicalApplication } from '../queries/control-action-view';
import { useAuthSnapshot } from '../use-auth-snapshot';
import {
	type ActionLocation,
	actionEditIntents,
	contextFor,
	metadataChanged,
} from './performed-action-writes';
import { newRecordId, optimisticStamp } from './shared';

/** What an application form collects, in the vocabulary the page speaks. */
export interface ApplicationValues {
	readonly insecticideId: string;
	readonly amountApplied: number;
	readonly unitId: string;
	/** `YYYY-MM-DD` — the operational date, not a timestamp. */
	readonly actionDate: string;
	/** `null` when the crew recorded no method. */
	readonly methodId: string | null;
	/** `null` when the crew recorded no lead applicator. */
	readonly applicatorProfileId: string | null;
	readonly vehicleId: string | null;
	readonly equipmentId: string | null;
	/** Reference only; the application's own point is its authoritative location. */
	readonly addressId: string | null;
	/** The Habitat that was treated, if any. */
	readonly habitatId: string | null;
	readonly metadata: unknown;
}

export interface RecordApplicationInput {
	/** Minted by the caller — see `newRecordId` in `shared.ts` for why. */
	readonly applicationId: string;
	readonly values: ApplicationValues;
	readonly location: ActionLocation;
	/** The lots this application drew from. Written with it, in one command. */
	readonly insecticideBatchIds: readonly string[];
	/** Set when the treatment was recorded against a mission stop. */
	readonly missionItemId: string | null;
	readonly acknowledgements?: StopAcknowledgements;
}

export interface UpdateApplicationInput {
	readonly values: ApplicationValues;
	/** Only when the user moved the point this session. */
	readonly location?: ActionLocation;
	readonly acknowledgements?: StopAcknowledgements;
}

/** One linked lot, as much of it as reconciling needs. */
export interface ApplicationBatchLink {
	readonly id: string;
	readonly insecticideBatchId: string;
}

export interface SetApplicationBatchesInput {
	readonly applicationId: string;
	/** What is linked now — read from `application_batches`, so its ids are known. */
	readonly existing: readonly ApplicationBatchLink[];
	/** Which lots the form says should be linked. */
	readonly insecticideBatchIds: readonly string[];
}

export interface ApplicationMutations {
	readonly record: (input: RecordApplicationInput) => Promise<void>;
	readonly update: (current: ChemicalApplication, input: UpdateApplicationInput) => Promise<void>;
	/** Link one more lot. Its own command — nothing to do with the record's edit. */
	readonly addBatch: (applicationId: string, insecticideBatchId: string) => Promise<void>;
	/** Unlink one, by the *link* row's id — which is also how the server reaches its performer. */
	readonly removeBatch: (applicationBatchId: string) => Promise<void>;
	/** Both of the above, until the links match a selection. What an edit form saves. */
	readonly setBatches: (input: SetApplicationBatchesInput) => Promise<void>;
	readonly remove: (
		applicationId: string,
		acknowledgements?: StopAcknowledgements,
	) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useApplicationMutations(): ApplicationMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const record = useCallback(
		async ({
			applicationId,
			values,
			location,
			insecticideBatchIds,
			missionItemId,
			acknowledgements,
		}: RecordApplicationInput) => {
			if (organizationId === null || actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}

			const now = optimisticStamp();
			const row = {
				id: applicationId,
				organization_id: organizationId,
				application_method_id: values.methodId,
				insecticide_id: values.insecticideId,
				applicator_profile_id: values.applicatorProfileId,
				application_date: values.actionDate,
				lat: location.lat,
				lng: location.lng,
				geom_type: location.geomType,
				address_id: values.addressId,
				vehicle_id: values.vehicleId,
				equipment_id: values.equipmentId,
				amount_applied: values.amountApplied,
				application_unit_id: values.unitId,
				habitat_id: values.habitatId,
				// A create never promotes an existing Inspection, Collection or requested
				// action; all three are attached by the flows that own them.
				collection_id: null,
				inspection_id: null,
				requested_control_action_id: null,
				mission_item_id: missionItemId,
				metadata: values.metadata,
				created_by_profile_id: actorProfileId,
				updated_by_profile_id: actorProfileId,
				created_at: now,
				updated_at: now,
				// `satisfies` rather than `as`: it is what makes a wrong column name a
				// compile error rather than a field the server silently ignores.
			} satisfies ApplicationRow;

			// Ids minted here so the same values describe the optimistic row and the
			// row the server writes — a link the server invented an id for would arrive
			// over sync as a second copy of one already on screen.
			const links = insecticideBatchIds.map(
				(insecticideBatchId) =>
					({
						id: newRecordId(),
						organization_id: organizationId,
						application_id: applicationId,
						insecticide_batch_id: insecticideBatchId,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					}) satisfies ApplicationBatchRow,
			);

			await settleWrite(
				commandTransaction({
					// The stop is what makes it the other command. Both write this table
					// and its batches; only one of them also closes the mission item.
					intent:
						missionItemId === null
							? 'controlOperations.recordChemicalApplication'
							: 'missionDispatch.recordChemicalApplicationForMissionItem',
					request: {
						table: 'applications',
						method: 'POST',
						body: {
							...commandBodyFromRow(row, {
								...(location.locationSource === undefined
									? {}
									: { locationSource: location.locationSource }),
								context: contextFor(values.habitatId, null),
								...(acknowledgements === undefined ? {} : { acknowledgements }),
							}),
							// The children, spelled as the rows they become.
							application_batches: links.map((link) => ({
								id: link.id,
								insecticide_batch_id: link.insecticide_batch_id,
							})),
						},
					},
					apply: () => {
						applications.insert(row);
						for (const link of links) {
							application_batches.insert(link);
						}
					},
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const update = useCallback(
		async (
			current: ChemicalApplication,
			{ values, location, acknowledgements }: UpdateApplicationInput,
		) => {
			if (actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}

			const fieldsMoved =
				current.insecticideId !== values.insecticideId ||
				current.amountApplied !== values.amountApplied ||
				current.unitId !== values.unitId ||
				current.actionDate !== values.actionDate ||
				current.methodId !== values.methodId ||
				current.applicatorProfileId !== values.applicatorProfileId ||
				current.vehicleId !== values.vehicleId ||
				current.equipmentId !== values.equipmentId ||
				metadataChanged(current.metadata, values.metadata);

			const habitatMoved = current.habitatId !== values.habitatId;
			const addressMoved = current.addressId !== values.addressId;
			const placementMoved = habitatMoved || addressMoved || location?.locationSource !== undefined;

			if (!fieldsMoved && !placementMoved) {
				return;
			}

			const intent = actionEditIntents(
				fieldsMoved,
				placementMoved,
				'controlOperations.updateChemicalApplicationFieldDetails',
				'controlOperations.updateChemicalApplicationLocationAndContext',
			);

			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(applications, {
					operation: 'update',
					intent,
					key: current.id,
					changes: {
						...(fieldsMoved
							? {
									insecticide_id: values.insecticideId,
									amount_applied: values.amountApplied,
									application_unit_id: values.unitId,
									application_date: values.actionDate,
									application_method_id: values.methodId,
									applicator_profile_id: values.applicatorProfileId,
									vehicle_id: values.vehicleId,
									equipment_id: values.equipmentId,
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

	const addBatch = useCallback(
		async (applicationId: string, insecticideBatchId: string) => {
			if (organizationId === null || actorProfileId === null) {
				throw new Error('Your profile is still loading.');
			}

			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(application_batches, {
					operation: 'insert',
					intent: 'controlOperations.addChemicalApplicationBatch',
					row: {
						id: newRecordId(),
						organization_id: organizationId,
						application_id: applicationId,
						insecticide_batch_id: insecticideBatchId,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies ApplicationBatchRow,
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const removeBatch = useCallback(async (applicationBatchId: string) => {
		await settleWrite(
			mutateCollection(application_batches, {
				operation: 'delete',
				intent: 'controlOperations.removeChemicalApplicationBatch',
				key: applicationBatchId,
			}),
		);
	}, []);

	const setBatches = useCallback(
		async ({ applicationId, existing, insecticideBatchIds }: SetApplicationBatchesInput) => {
			const { removals, additions } = reconcileLinks(
				existing,
				(row) => row.insecticideBatchId,
				insecticideBatchIds,
			);

			// Concurrently: these are independent rows, and each is its own command, so
			// there is no order for them to be in.
			await Promise.all([
				...removals.map((row) => removeBatch(row.id)),
				...additions.map((insecticideBatchId) => addBatch(applicationId, insecticideBatchId)),
			]);
		},
		[addBatch, removeBatch],
	);

	const remove = useCallback(
		async (applicationId: string, acknowledgements?: StopAcknowledgements) => {
			await settleWrite(
				mutateCollection(applications, {
					operation: 'delete',
					intent: 'controlOperations.deleteChemicalApplication',
					key: applicationId,
					...(acknowledgements === undefined ? {} : { acknowledgements }),
				}),
			);
		},
		[],
	);

	return {
		record,
		update,
		addBatch,
		removeBatch,
		setBatches,
		remove,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}

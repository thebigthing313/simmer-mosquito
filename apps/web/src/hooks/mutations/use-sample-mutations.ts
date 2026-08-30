/**
 * The specimens taken during an inspection.
 *
 * Eight commands over one small table, and the reason there are eight is the
 * clearest case in the domain for naming a command rather than inferring it.
 * The routes this replaces worked out three separate decisions from the payload:
 *
 * - a `displayName` that read as text meant `addInspectionSample` and one that
 *   did not meant `addUnlabeledInspectionSample`, so a caller who typed a label
 *   of spaces silently created an unlabeled sample;
 * - `is_zero_larvae: true` meant `markSampleZeroLarvae` and `false` meant
 *   `clearSampleZeroLarvae` — a value read for its direction;
 * - and everything else was `'field' in payload`.
 *
 * Each write below says which it means, so a blank label is refused by
 * {@link SampleMutations.add} rather than quietly becoming a different record.
 *
 * ## Why non-mosquito presence is not the same shape as zero-larvae
 *
 * Both are booleans on the row, and only one of them is two commands.
 * "No larvae in this sample" is a finding the inspector asserts and can take
 * back, so which way it moved is the point. "There were non-mosquito larvae in
 * it" is an observation the field recorded, so the value is the point. The
 * server's intent map draws the same line, and this follows it rather than
 * imposing a symmetry the domain does not have.
 */

import { type Sample, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { mutateCollection } from '../../lib/collections/mutate';
import { samples } from '../../lib/collections/samples';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { optimisticStamp } from './shared';

export interface SampleMutations {
	/**
	 * Add a specimen to an inspection.
	 *
	 * `displayName` is `null` for an unlabeled sample, which is a different
	 * command rather than the same one with a field missing. The id is the
	 * caller's so a create page can write the species counts under it in the same
	 * pass.
	 */
	readonly add: (input: {
		readonly sampleId: string;
		readonly inspectionId: string;
		readonly displayName: string | null;
	}) => Promise<void>;
	/** Relabel a sample. The domain refuses a blank name here — see {@link add}. */
	readonly rename: (sampleId: string, displayName: string) => Promise<void>;
	/** Whether the inspector found no larvae in it at all. */
	readonly setZeroLarvae: (sampleId: string, isZeroLarvae: boolean) => Promise<void>;
	/** Whether it held non-mosquito larvae — an observation, so one command. */
	readonly setNonMosquito: (sampleId: string, hasNonMosquito: boolean) => Promise<void>;
	/** Why the specimen could not be identified, or `null` to clear it. */
	readonly setUnidentifiableReason: (
		sampleId: string,
		unidentifiableReason: string | null,
	) => Promise<void>;
	/**
	 * Delete a sample.
	 *
	 * `acknowledgements` is what the user answered. A withheld flag goes on the
	 * wire as `false`, which is the only reading that makes the registry refuse.
	 */
	readonly remove: (
		sampleId: string,
		acknowledgements?: Readonly<Record<string, boolean>>,
	) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useSampleMutations(): SampleMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const add = useCallback(
		async ({
			sampleId,
			inspectionId,
			displayName,
		}: {
			readonly sampleId: string;
			readonly inspectionId: string;
			readonly displayName: string | null;
		}) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}

			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(samples, {
					operation: 'insert',
					// Two intentions, not one command with an optional field.
					intent:
						displayName === null
							? 'larvalSurveillance.addUnlabeledInspectionSample'
							: 'larvalSurveillance.addInspectionSample',
					row: {
						id: sampleId,
						organization_id: organizationId,
						inspection_id: inspectionId,
						display_name: displayName,
						is_zero_larvae: false,
						has_non_mosquito: false,
						unidentifiable_reason: null,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies Sample,
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const rename = useCallback(
		async (sampleId: string, displayName: string) => {
			await settleWrite(
				mutateCollection(samples, {
					operation: 'update',
					intent: 'larvalSurveillance.updateInspectionSample',
					key: sampleId,
					changes: {
						display_name: displayName,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const setZeroLarvae = useCallback(
		async (sampleId: string, isZeroLarvae: boolean) => {
			await settleWrite(
				mutateCollection(samples, {
					operation: 'update',
					intent: isZeroLarvae
						? 'larvalSurveillance.markSampleZeroLarvae'
						: 'larvalSurveillance.clearSampleZeroLarvae',
					key: sampleId,
					changes: {
						is_zero_larvae: isZeroLarvae,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const setNonMosquito = useCallback(
		async (sampleId: string, hasNonMosquito: boolean) => {
			await settleWrite(
				mutateCollection(samples, {
					operation: 'update',
					intent: 'larvalSurveillance.setSampleNonMosquitoPresence',
					key: sampleId,
					changes: {
						has_non_mosquito: hasNonMosquito,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const setUnidentifiableReason = useCallback(
		async (sampleId: string, unidentifiableReason: string | null) => {
			await settleWrite(
				mutateCollection(samples, {
					operation: 'update',
					intent: 'larvalSurveillance.setSampleUnidentifiableReason',
					key: sampleId,
					changes: {
						unidentifiable_reason: unidentifiableReason,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(
		async (sampleId: string, acknowledgements: Readonly<Record<string, boolean>> = {}) => {
			await settleWrite(
				mutateCollection(samples, {
					operation: 'delete',
					intent: 'larvalSurveillance.deleteInspectionSample',
					key: sampleId,
					// A delete carries no row and no changed fields, so an acknowledgement
					// is the only thing it can say beyond the command's name.
					acknowledgements,
				}),
			);
		},
		[],
	);

	return {
		add,
		rename,
		setZeroLarvae,
		setNonMosquito,
		setUnidentifiableReason,
		remove,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}

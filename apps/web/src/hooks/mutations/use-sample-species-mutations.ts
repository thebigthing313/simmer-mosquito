/**
 * What was identified in a sample, and how many of it.
 *
 * The counts under `use-sample-mutations.ts`. Three commands, and the only one
 * worth explaining is the edit.
 *
 * ## The edit sends only what moved, field by field
 *
 * Unlike most updates in this folder, which name a command per group of
 * columns, `updateSampleSpeciesCount` takes four independently optional fields
 * and reads them by presence — a count corrected from 12 to 8 says nothing
 * about which species it was, and re-sending the species would be this layer
 * inventing an edit that the identifier did not make. So the changes are built
 * from a comparison against the row, and a field that did not move is absent
 * rather than restated.
 *
 * ## Identification is provenance, not a timestamp
 *
 * `identified_at` is a `YYYY-MM-DD` string, and `identified_by_profile_id` is
 * whoever put a name to the specimen — which is often not whoever inspected the
 * habitat, and often not today. Both are the caller's to state, so neither is
 * filled in here.
 */

import { type SampleSpecies, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { mutateCollection } from '../../lib/collections/mutate';
import { sample_species } from '../../lib/collections/sample_species';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { optimisticStamp } from './shared';

/** One identification, as a key-entry grid or a detail page holds it. */
export interface SampleSpeciesFields {
	readonly speciesId: string;
	readonly larvaeCount: number;
	/** `null` when nobody was recorded as the identifier. */
	readonly identifiedByProfileId: string | null;
	/** `YYYY-MM-DD` — the day it was identified, not a timestamp. */
	readonly identifiedAt: string;
}

export interface SampleSpeciesMutations {
	/** The id is the caller's, so a grid can key its rows before the write lands. */
	readonly add: (input: {
		readonly sampleSpeciesId: string;
		readonly sampleId: string;
		readonly fields: SampleSpeciesFields;
	}) => Promise<void>;
	/**
	 * Correct an identification.
	 *
	 * Resolves without sending anything when nothing moved — the domain refuses a
	 * command with nothing to change, so a grid that saves an untouched row must
	 * not reach the server at all.
	 */
	readonly save: (
		sampleSpeciesId: string,
		fields: SampleSpeciesFields,
		current: SampleSpeciesFields,
	) => Promise<void>;
	readonly remove: (sampleSpeciesId: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useSampleSpeciesMutations(): SampleSpeciesMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const add = useCallback(
		async ({
			sampleSpeciesId,
			sampleId,
			fields,
		}: {
			readonly sampleSpeciesId: string;
			readonly sampleId: string;
			readonly fields: SampleSpeciesFields;
		}) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}

			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(sample_species(), {
					operation: 'insert',
					intent: 'larvalSurveillance.addSampleSpeciesCount',
					row: {
						id: sampleSpeciesId,
						organization_id: organizationId,
						sample_id: sampleId,
						species_id: fields.speciesId,
						larvae_count: fields.larvaeCount,
						identified_by_profile_id: fields.identifiedByProfileId,
						identified_at: fields.identifiedAt,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies SampleSpecies,
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(
		async (sampleSpeciesId: string, fields: SampleSpeciesFields, current: SampleSpeciesFields) => {
			const changes: Partial<SampleSpecies> = {};
			if (fields.speciesId !== current.speciesId) {
				changes.species_id = fields.speciesId;
			}
			if (fields.larvaeCount !== current.larvaeCount) {
				changes.larvae_count = fields.larvaeCount;
			}
			if (fields.identifiedByProfileId !== current.identifiedByProfileId) {
				changes.identified_by_profile_id = fields.identifiedByProfileId;
			}
			if (fields.identifiedAt !== current.identifiedAt) {
				changes.identified_at = fields.identifiedAt;
			}

			if (Object.keys(changes).length === 0) {
				return;
			}

			await settleWrite(
				mutateCollection(sample_species(), {
					operation: 'update',
					intent: 'larvalSurveillance.updateSampleSpeciesCount',
					key: sampleSpeciesId,
					changes: {
						...changes,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(async (sampleSpeciesId: string) => {
		await settleWrite(
			mutateCollection(sample_species(), {
				operation: 'delete',
				// No acknowledgement: nothing hangs off a count, so removing one takes
				// nothing with it.
				intent: 'larvalSurveillance.deleteSampleSpeciesCount',
				key: sampleSpeciesId,
			}),
		);
	}, []);

	return {
		add,
		save,
		remove,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}

/**
 * What was identified in an Adult Collection — added, corrected, removed.
 *
 * The adult counterpart of `use-sample-species-mutations.ts`, and the same
 * three commands. Where they differ is what a row means: a larval sample's
 * species line is a count of larvae found in one dip set, and an adult one is a
 * count of specimens of one species, sex and physiological status. That is why
 * the correction takes a change set rather than a whole row — a count corrected
 * from 40 to 38 says nothing about the species, and re-sending the rest would be
 * this layer inventing an edit the technician did not make.
 *
 * `identifiedDate` is the agency's today rather than the browser's, which is why
 * `add` takes it instead of reading a clock: an identification keyed at 11pm on
 * a lab machine two zones away belongs to the day the agency is having.
 */

import { type CollectionSpecies, settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { collection_species } from '../../lib/collections/collection_species';
import { mutateCollection } from '../../lib/collections/mutate';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { optimisticStamp } from './shared';

/** The physiological state a female was in — adult identification only. */
export type SpeciesStatus = CollectionSpecies['status'];
export type SpeciesSex = CollectionSpecies['sex'];

/** One identification, as the form that records it holds one. */
export interface CollectionSpeciesFields {
	readonly speciesId: string;
	readonly count: number;
	readonly sex: SpeciesSex;
	readonly status: SpeciesStatus;
}

/** What a correction may restate. Absent means "leave it" — see the module note. */
export interface CollectionSpeciesChanges {
	readonly speciesId?: string;
	readonly count?: number;
	readonly sex?: SpeciesSex;
	readonly status?: SpeciesStatus;
}

export interface CollectionSpeciesMutations {
	readonly add: (input: {
		readonly collectionId: string;
		readonly fields: CollectionSpeciesFields;
		/** `YYYY-MM-DD` on the agency's clock, not the browser's. */
		readonly identifiedDate: string;
		/** Minted by the caller when it needs the id back — key entry tracks its rows. */
		readonly collectionSpeciesId: string;
	}) => Promise<void>;
	/** Resolves without sending anything when the change set is empty. */
	readonly save: (collectionSpeciesId: string, changes: CollectionSpeciesChanges) => Promise<void>;
	readonly remove: (collectionSpeciesId: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useCollectionSpeciesMutations(): CollectionSpeciesMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const add = useCallback(
		async ({
			collectionId,
			fields,
			identifiedDate,
			collectionSpeciesId,
		}: {
			readonly collectionId: string;
			readonly fields: CollectionSpeciesFields;
			readonly identifiedDate: string;
			readonly collectionSpeciesId: string;
		}) => {
			if (organizationId === null) {
				throw new Error('Organization details are still loading.');
			}

			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(collection_species(), {
					operation: 'insert',
					intent: 'adultSurveillance.addCollectionSpeciesCount',
					row: {
						id: collectionSpeciesId,
						organization_id: organizationId,
						collection_id: collectionId,
						species_id: fields.speciesId,
						count: fields.count,
						sex: fields.sex,
						status: fields.status,
						identified_by_profile_id: actorProfileId,
						identified_date: identifiedDate,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies CollectionSpecies,
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(
		async (collectionSpeciesId: string, changes: CollectionSpeciesChanges) => {
			const columns: Partial<CollectionSpecies> = {};
			if (changes.speciesId !== undefined) {
				columns.species_id = changes.speciesId;
			}
			if (changes.count !== undefined) {
				columns.count = changes.count;
			}
			if (changes.sex !== undefined) {
				columns.sex = changes.sex;
			}
			if (changes.status !== undefined) {
				columns.status = changes.status;
			}

			// The domain refuses a command with nothing to change, so an empty set is
			// not a request worth making.
			if (Object.keys(columns).length === 0) {
				return;
			}

			await settleWrite(
				mutateCollection(collection_species(), {
					operation: 'update',
					intent: 'adultSurveillance.updateCollectionSpeciesCount',
					key: collectionSpeciesId,
					changes: {
						...columns,
						updated_by_profile_id: actorProfileId,
						updated_at: optimisticStamp(),
					},
				}),
			);
		},
		[actorProfileId],
	);

	const remove = useCallback(async (collectionSpeciesId: string) => {
		await settleWrite(
			mutateCollection(collection_species(), {
				operation: 'delete',
				intent: 'adultSurveillance.deleteCollectionSpeciesCount',
				key: collectionSpeciesId,
			}),
		);
	}, []);

	return { add, save, remove, canWrite: organizationId !== null && actorProfileId !== null };
}

/**
 * Writing formulations and the products in them.
 *
 * A formulation is a recipe: a batch size, and one or more insecticides at an
 * amount each. Two tables, and three things about them that are not the catalog
 * pattern.
 *
 * ## `activate`, not `reactivate`
 *
 * A formulation can be deactivated by the *system* — removing its last component
 * leaves nothing to mix — so turning one back on is not always undoing a person's
 * decision. The domain names the two directions `activateFormulation` and
 * `deactivateFormulation`, and the page's toggle says "activate" for the same
 * reason.
 *
 * ## Emptying a recipe deactivates it
 *
 * Which is why `acknowledgedDeactivateEmptyFormulation` rides on the component
 * edit as well as the removal: changing a component's product or amount can leave
 * the formulation with nothing in it just as removing it can. The page answers
 * the question for the user at the point it asks it, which is what the delete
 * dialog's copy is for.
 *
 * ## Deleting a formulation deletes its components
 *
 * `acknowledgedComponentDeletion` is the same shape of answer, one level up.
 */

import type { Formulation, FormulationInsecticide } from '@simmer-mosquito/sync';
import { settleWrite } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { formulation_insecticides } from '../../lib/collections/formulation_insecticides';
import { formulations } from '../../lib/collections/formulations';
import { mutateCollection } from '../../lib/collections/mutate';
import { useAuthSnapshot } from '../use-auth-snapshot';
import { newRecordId, optimisticStamp } from './shared';

/** A recipe as its drawer holds one. */
export interface FormulationFields {
	readonly formulationName: string;
	readonly description: string | null;
	readonly batchSize: number;
	readonly batchUnitId: string;
	readonly isActive: boolean;
}

/** One product in a recipe, and how much of it a batch takes. */
export interface FormulationComponentFields {
	readonly insecticideId: string;
	readonly amount: number;
	readonly unitId: string;
}

export interface FormulationMutations {
	readonly create: (fields: FormulationFields) => Promise<string>;
	readonly save: (
		id: string,
		fields: FormulationFields,
		current: FormulationFields,
	) => Promise<void>;
	readonly setActive: (id: string, isActive: boolean) => Promise<void>;
	readonly remove: (id: string) => Promise<void>;
	readonly addComponent: (
		formulationId: string,
		fields: FormulationComponentFields,
	) => Promise<void>;
	readonly saveComponent: (
		componentId: string,
		fields: FormulationComponentFields,
	) => Promise<void>;
	readonly removeComponent: (componentId: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

export function useFormulationMutations(): FormulationMutations {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	const organizationId = identity?.organizationId ?? null;
	const actorProfileId = identity?.profileId ?? null;

	const create = useCallback(
		async (fields: FormulationFields) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}
			const now = optimisticStamp();
			const row = {
				id: newRecordId(),
				organization_id: organizationId,
				formulation_name: fields.formulationName,
				description: fields.description,
				is_active: fields.isActive,
				batch_size: fields.batchSize,
				batch_unit_id: fields.batchUnitId,
				created_by_profile_id: actorProfileId,
				updated_by_profile_id: actorProfileId,
				created_at: now,
				updated_at: now,
			} satisfies Formulation;

			await settleWrite(
				mutateCollection(formulations, {
					operation: 'insert',
					// A recipe with nothing in it cannot be mixed, so a new one that the
					// dialog left inactive says so rather than being written active and
					// flicking back — see `catalog-writes.ts`.
					intent: fields.isActive
						? 'controlOperations.createFormulation'
						: ['controlOperations.createFormulation', 'controlOperations.deactivateFormulation'],
					row,
				}),
			);
			return row.id;
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(
		async (id: string, fields: FormulationFields, current: FormulationFields) => {
			const changes: Partial<Formulation> = {};
			if (fields.formulationName !== current.formulationName) {
				changes.formulation_name = fields.formulationName;
			}
			if (fields.description !== current.description) {
				changes.description = fields.description;
			}
			if (fields.batchSize !== current.batchSize) {
				changes.batch_size = fields.batchSize;
			}
			if (fields.batchUnitId !== current.batchUnitId) {
				changes.batch_unit_id = fields.batchUnitId;
			}

			const intents: (
				| 'controlOperations.updateFormulationDetails'
				| 'controlOperations.activateFormulation'
				| 'controlOperations.deactivateFormulation'
			)[] = [];
			if (Object.keys(changes).length > 0) {
				intents.push('controlOperations.updateFormulationDetails');
			}
			if (fields.isActive !== current.isActive) {
				intents.push(
					fields.isActive
						? 'controlOperations.activateFormulation'
						: 'controlOperations.deactivateFormulation',
				);
			}
			if (intents.length === 0) {
				return;
			}

			await settleWrite(
				mutateCollection(formulations, {
					operation: 'update',
					intent: intents,
					key: id,
					changes: { ...changes, is_active: fields.isActive, updated_at: optimisticStamp() },
				}),
			);
		},
		[],
	);

	const setActive = useCallback(async (id: string, isActive: boolean) => {
		await settleWrite(
			mutateCollection(formulations, {
				operation: 'update',
				intent: isActive
					? 'controlOperations.activateFormulation'
					: 'controlOperations.deactivateFormulation',
				key: id,
				changes: { is_active: isActive, updated_at: optimisticStamp() },
			}),
		);
	}, []);

	const remove = useCallback(async (id: string) => {
		await settleWrite(
			mutateCollection(formulations, {
				operation: 'delete',
				intent: 'controlOperations.deleteFormulation',
				key: id,
				// The dialog says the components go with it, so the answer is given
				// where the question was asked.
				acknowledgements: { acknowledgedComponentDeletion: true },
			}),
		);
	}, []);

	const addComponent = useCallback(
		async (formulationId: string, fields: FormulationComponentFields) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}
			const now = optimisticStamp();
			await settleWrite(
				mutateCollection(formulation_insecticides, {
					operation: 'insert',
					intent: 'controlOperations.addFormulationInsecticide',
					row: {
						id: newRecordId(),
						organization_id: organizationId,
						formulation_id: formulationId,
						insecticide_id: fields.insecticideId,
						amount: fields.amount,
						unit_id: fields.unitId,
						created_by_profile_id: actorProfileId,
						updated_by_profile_id: actorProfileId,
						created_at: now,
						updated_at: now,
					} satisfies FormulationInsecticide,
				}),
			);
		},
		[organizationId, actorProfileId],
	);

	const saveComponent = useCallback(
		async (componentId: string, fields: FormulationComponentFields) => {
			await settleWrite(
				mutateCollection(formulation_insecticides, {
					operation: 'update',
					intent: 'controlOperations.updateFormulationInsecticide',
					key: componentId,
					changes: {
						insecticide_id: fields.insecticideId,
						amount: fields.amount,
						unit_id: fields.unitId,
						updated_at: optimisticStamp(),
					},
					acknowledgements: { acknowledgedDeactivateEmptyFormulation: true },
				}),
			);
		},
		[],
	);

	const removeComponent = useCallback(async (componentId: string) => {
		await settleWrite(
			mutateCollection(formulation_insecticides, {
				operation: 'delete',
				intent: 'controlOperations.removeFormulationInsecticide',
				key: componentId,
				acknowledgements: { acknowledgedDeactivateEmptyFormulation: true },
			}),
		);
	}, []);

	return {
		create,
		save,
		setActive,
		remove,
		addComponent,
		saveComponent,
		removeComponent,
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}

/**
 * Writing the agency's insecticides and their batches.
 *
 * Two tables with the five catalog commands each, so the writes come from
 * `catalog-writes.ts` and only the columns are here. What makes them not quite
 * catalogs is that a product carries nine editable columns and a batch belongs to
 * one — the batch is the tin on the shelf, the product is what is in it.
 *
 * The lifecycle is a command on both, as everywhere else on this surface: the old
 * PATCH read `is_active` and worked out the direction.
 *
 * `inventory_unit_id` and `conversion_factor` are columns this form does not
 * offer, so a create leaves them null and a save never names them. They exist for
 * an agency that buys in one unit and applies in another, and nothing in the app
 * sets them yet.
 */

import type { Insecticide, InsecticideBatch } from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { insecticide_batches } from '../../lib/collections/insecticide_batches';
import { insecticides } from '../../lib/collections/insecticides';
import { useAuthSnapshot } from '../use-auth-snapshot';
import {
	type CatalogCommandNames,
	createCatalogRow,
	deleteCatalogRow,
	saveCatalogRow,
	setCatalogRowActive,
} from './catalog-writes';
import { newRecordId, optimisticStamp } from './shared';

/** A product as its drawer holds one. */
export interface InsecticideFields {
	readonly tradeName: string;
	readonly activeIngredient: string;
	readonly type: Insecticide['type'];
	readonly registrationNumber: string;
	readonly defaultUnitId: string;
	readonly labelUrl: string | null;
	readonly msdsUrl: string | null;
	/** The agency's data-entry abbreviation — not a second name for the product. */
	readonly shorthand: string | null;
	readonly metadata: unknown;
	readonly isActive: boolean;
}

export interface InsecticideMutations {
	readonly create: (fields: InsecticideFields) => Promise<string>;
	/**
	 * Save an edited product.
	 *
	 * `acknowledgements` is what the user has answered. Only a save that moves the
	 * product's identity puts a flag on the wire; {@link useInsecticideMutations}
	 * is what draws that line, so the form passes everything it has.
	 */
	readonly save: (
		id: string,
		fields: InsecticideFields,
		current: InsecticideFields,
		acknowledgements?: Readonly<Record<string, boolean>>,
	) => Promise<void>;
	readonly setActive: (id: string, isActive: boolean) => Promise<void>;
	readonly remove: (id: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

const insecticideCommands: CatalogCommandNames = {
	create: 'controlOperations.createInsecticide',
	update: 'controlOperations.updateInsecticide',
	deactivate: 'controlOperations.deactivateInsecticide',
	reactivate: 'controlOperations.reactivateInsecticide',
	remove: 'controlOperations.deleteInsecticide',
};

/**
 * The columns that say what the product *is*.
 *
 * A past application, batch or formulation stores none of this and reads it back
 * off the product, so moving any one of them relabels history and the server
 * asks about it. Split from the rest for that reason rather than for length:
 * whether a save answers `acknowledgedHistoricalProductChange` is exactly
 * "did anything in here move", and the two lists used to be written out
 * separately and could drift apart.
 */
function insecticideIdentityChanges(
	fields: InsecticideFields,
	current: InsecticideFields,
): Partial<Insecticide> {
	const changes: Partial<Insecticide> = {};
	if (fields.tradeName !== current.tradeName) {
		changes.trade_name = fields.tradeName;
	}
	if (fields.activeIngredient !== current.activeIngredient) {
		changes.active_ingredient = fields.activeIngredient;
	}
	if (fields.type !== current.type) {
		changes.type = fields.type;
	}
	if (fields.registrationNumber !== current.registrationNumber) {
		changes.registration_number = fields.registrationNumber;
	}
	if (fields.defaultUnitId !== current.defaultUnitId) {
		changes.default_unit_id = fields.defaultUnitId;
	}
	return changes;
}

/**
 * The columns that point at the product without being it.
 *
 * Where its label and safety sheet live, the agency's own abbreviation for it,
 * and its notes. A save that moved only these answers no question, and the
 * server draws the same line.
 */
function insecticideReferenceChanges(
	fields: InsecticideFields,
	current: InsecticideFields,
): Partial<Insecticide> {
	const changes: Partial<Insecticide> = {};
	if (fields.labelUrl !== current.labelUrl) {
		changes.label_url = fields.labelUrl;
	}
	if (fields.msdsUrl !== current.msdsUrl) {
		changes.msds_url = fields.msdsUrl;
	}
	if (fields.shorthand !== current.shorthand) {
		changes.shorthand = fields.shorthand;
	}
	if (fields.metadata !== current.metadata) {
		changes.metadata = fields.metadata;
	}
	return changes;
}

export function useInsecticideMutations(): InsecticideMutations {
	const { organizationId, actorProfileId } = useProductWriterIdentity();

	const create = useCallback(
		async (fields: InsecticideFields) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}
			const now = optimisticStamp();
			const row = {
				id: newRecordId(),
				organization_id: organizationId,
				trade_name: fields.tradeName,
				active_ingredient: fields.activeIngredient,
				is_active: fields.isActive,
				type: fields.type,
				registration_number: fields.registrationNumber,
				default_unit_id: fields.defaultUnitId,
				inventory_unit_id: null,
				conversion_factor: null,
				label_url: fields.labelUrl,
				msds_url: fields.msdsUrl,
				shorthand: fields.shorthand,
				metadata: fields.metadata,
				created_by_profile_id: actorProfileId,
				updated_by_profile_id: actorProfileId,
				created_at: now,
				updated_at: now,
			} satisfies Insecticide;
			await createCatalogRow(insecticides, insecticideCommands, row);
			return row.id;
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(
		async (
			id: string,
			fields: InsecticideFields,
			current: InsecticideFields,
			acknowledgements: Readonly<Record<string, boolean>> = {},
		) => {
			const identity = insecticideIdentityChanges(fields, current);
			const identityMoved = Object.keys(identity).length > 0;

			await saveCatalogRow(insecticides, insecticideCommands, id, {
				changes: { ...identity, ...insecticideReferenceChanges(fields, current) },
				isActive: fields.isActive,
				wasActive: current.isActive,
				...(identityMoved
					? {
							acknowledgements: {
								acknowledgedHistoricalProductChange:
									acknowledgements.acknowledgedHistoricalProductChange === true,
							},
						}
					: {}),
			});
		},
		[],
	);

	return {
		create,
		save,
		setActive: (id, isActive) =>
			setCatalogRowActive(insecticides, insecticideCommands, id, isActive),
		remove: (id) => deleteCatalogRow(insecticides, insecticideCommands, id),
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}

/** A batch as its drawer holds one. */
export interface InsecticideBatchFields {
	readonly insecticideId: string;
	readonly batchName: string;
	readonly isActive: boolean;
}

export interface InsecticideBatchMutations {
	readonly create: (fields: InsecticideBatchFields) => Promise<string>;
	/**
	 * Save an edited batch.
	 *
	 * `acknowledgements` is what the user has answered. Only a rename puts a flag
	 * on the wire, and the switch is not a rename.
	 */
	readonly save: (
		id: string,
		fields: InsecticideBatchFields,
		current: InsecticideBatchFields,
		acknowledgements?: Readonly<Record<string, boolean>>,
	) => Promise<void>;
	readonly setActive: (id: string, isActive: boolean) => Promise<void>;
	readonly remove: (id: string) => Promise<void>;
	readonly canWrite: boolean;
}

const batchCommands: CatalogCommandNames = {
	create: 'controlOperations.createInsecticideBatch',
	update: 'controlOperations.updateInsecticideBatch',
	deactivate: 'controlOperations.deactivateInsecticideBatch',
	reactivate: 'controlOperations.reactivateInsecticideBatch',
	remove: 'controlOperations.deleteInsecticideBatch',
};

export function useInsecticideBatchMutations(): InsecticideBatchMutations {
	const { organizationId, actorProfileId } = useProductWriterIdentity();

	const create = useCallback(
		async (fields: InsecticideBatchFields) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}
			const now = optimisticStamp();
			const row = {
				id: newRecordId(),
				organization_id: organizationId,
				insecticide_id: fields.insecticideId,
				batch_name: fields.batchName,
				is_active: fields.isActive,
				created_by_profile_id: actorProfileId,
				updated_by_profile_id: actorProfileId,
				created_at: now,
				updated_at: now,
			} satisfies InsecticideBatch;
			await createCatalogRow(insecticide_batches, batchCommands, row);
			return row.id;
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(
		async (
			id: string,
			fields: InsecticideBatchFields,
			current: InsecticideBatchFields,
			acknowledgements: Readonly<Record<string, boolean>> = {},
		) => {
			// Only the name: `updateInsecticideBatch` does not move a batch between
			// products, because an application already recorded against it was made
			// with what was in that tin.
			const changes: Partial<InsecticideBatch> = {};
			if (fields.batchName !== current.batchName) {
				changes.batch_name = fields.batchName;
			}
			await saveCatalogRow(insecticide_batches, batchCommands, id, {
				changes,
				isActive: fields.isActive,
				wasActive: current.isActive,
				// The name is the whole of what an application's batch link reads back
				// under, so retiring a batch on its own answers nothing.
				...(changes.batch_name === undefined
					? {}
					: {
							acknowledgements: {
								acknowledgedHistoricalBatchLabelChange:
									acknowledgements.acknowledgedHistoricalBatchLabelChange === true,
							},
						}),
			});
		},
		[],
	);

	return {
		create,
		save,
		setActive: (id, isActive) =>
			setCatalogRowActive(insecticide_batches, batchCommands, id, isActive),
		remove: (id) => deleteCatalogRow(insecticide_batches, batchCommands, id),
		canWrite: organizationId !== null && actorProfileId !== null,
	};
}

function useProductWriterIdentity(): {
	readonly organizationId: string | null;
	readonly actorProfileId: string | null;
} {
	const auth = useAuthSnapshot();
	const identity = auth?.authenticated === true ? auth.localIdentity : null;
	return {
		organizationId: identity?.organizationId ?? null,
		actorProfileId: identity?.profileId ?? null,
	};
}

/**
 * Writing the agency's lookup catalogs.
 *
 * The mirror of `hooks/queries/use-catalog-rosters.ts`, and one file for the same
 * reason: eight tables asked the same four questions — add one, edit one, retire
 * or restore one, delete one. What differs between them is three columns and five
 * command names, so that is all each hook below states. The writes themselves are
 * in `catalog-writes.ts`.
 *
 * The eight are the three org lookups (`collection_methods`, `collection_lures`,
 * `habitat_types`), the four control-method catalogs, and `notification_types`.
 * `tags`, `units`, `insecticides` and `formulations` are catalogs too and are not
 * here: each has a shape of its own — a colour and an assignment, a conversion
 * factor, a chemical, a mixture — and folding them in would mean a fields type
 * that is mostly absent members.
 *
 * ## Each hook writes its own row literal
 *
 * Under `satisfies`, which is what makes a wrong column name a compile error
 * rather than a body the server quietly drops. It is the reason these are eight
 * short hooks rather than one generic taking a column descriptor: the descriptor
 * would have to be cast into a row, and the cast is exactly what let camelCase
 * rows through in silence.
 */

import type {
	ApplicationMethod,
	CollectionLure,
	CollectionMethod,
	HabitatType,
	NotificationType,
} from '@simmer-mosquito/sync';
import { useCallback } from 'react';
import { application_methods } from '../../lib/collections/application_methods';
import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { collection_lures } from '../../lib/collections/collection_lures';
import { collection_methods } from '../../lib/collections/collection_methods';
import { habitat_types } from '../../lib/collections/habitat_types';
import { notification_types } from '../../lib/collections/notification_types';
import { outreach_methods } from '../../lib/collections/outreach_methods';
import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';
import { useAuthSnapshot } from '../use-auth-snapshot';
import {
	type CatalogCollection,
	type CatalogCommandNames,
	type CatalogRow,
	createCatalogRow,
	deleteCatalogRow,
	saveCatalogRow,
	setCatalogRowActive,
} from './catalog-writes';
import { newRecordId, optimisticStamp } from './shared';

/**
 * A catalog record as its dialog holds it.
 *
 * One type for all eight, with the members a given catalog has no column for left
 * absent — a lure has no custom schema, a control method has no description. The
 * hook is what decides which of them reach a row, so a page passing one its
 * catalog does not have is writing into nothing rather than into the wrong
 * column.
 */
export interface CatalogFields {
	readonly name: string;
	readonly description?: string | null;
	readonly customSchema?: unknown;
	readonly actionThreshold?: number | null;
	readonly isActive: boolean;
}

export interface CatalogMutations {
	/** Returns the new row's id, so a caller can select or scroll to it. */
	readonly create: (fields: CatalogFields) => Promise<string>;
	/**
	 * Save an edited row.
	 *
	 * `current` is what it looked like before, because which commands a save means
	 * is a function of what moved: a rename is `update`, flipping the switch is
	 * `deactivate` or `reactivate`, and doing both at once is both names on one
	 * write.
	 */
	readonly save: (id: string, fields: CatalogFields, current: CatalogFields) => Promise<void>;
	/** The one-click retire and restore on the row menu. */
	readonly setActive: (id: string, isActive: boolean) => Promise<void>;
	readonly remove: (id: string) => Promise<void>;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

/** The columns every catalog row carries, stamped the same way on every create. */
function catalogRowBase(organizationId: string, actorProfileId: string | null) {
	const now = optimisticStamp();
	return {
		id: newRecordId(),
		organization_id: organizationId,
		created_by_profile_id: actorProfileId,
		updated_by_profile_id: actorProfileId,
		created_at: now,
		updated_at: now,
	};
}

/** The agency and actor every one of these writes is made on behalf of. */
function useWriterIdentity(): {
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

const collectionMethodCommands: CatalogCommandNames = {
	create: 'foundation.createCollectionMethod',
	update: 'foundation.updateCollectionMethod',
	deactivate: 'foundation.deactivateCollectionMethod',
	reactivate: 'foundation.reactivateCollectionMethod',
	remove: 'foundation.deleteCollectionMethod',
};

export function useCollectionMethodMutations(): CatalogMutations {
	const { organizationId, actorProfileId } = useWriterIdentity();

	const create = useCallback(
		async (fields: CatalogFields) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}
			const row = {
				...catalogRowBase(organizationId, actorProfileId),
				name: fields.name,
				description: fields.description ?? null,
				custom_schema: fields.customSchema ?? null,
				action_threshold: fields.actionThreshold ?? null,
				is_active: fields.isActive,
			} satisfies CollectionMethod;
			await createCatalogRow(collection_methods, collectionMethodCommands, row);
			return row.id;
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(async (id: string, fields: CatalogFields, current: CatalogFields) => {
		const changes: Partial<CollectionMethod> = {};
		if (fields.name !== current.name) {
			changes.name = fields.name;
		}
		if (fields.description !== current.description) {
			changes.description = fields.description ?? null;
		}
		if (fields.customSchema !== current.customSchema) {
			changes.custom_schema = fields.customSchema ?? null;
		}
		if (fields.actionThreshold !== current.actionThreshold) {
			changes.action_threshold = fields.actionThreshold ?? null;
		}
		await saveCatalogRow(collection_methods, collectionMethodCommands, id, {
			changes,
			isActive: fields.isActive,
			wasActive: current.isActive,
		});
	}, []);

	return catalogMutations(collection_methods, collectionMethodCommands, {
		create,
		save,
		canWrite: organizationId !== null && actorProfileId !== null,
	});
}

const collectionLureCommands: CatalogCommandNames = {
	create: 'foundation.createCollectionLure',
	update: 'foundation.updateCollectionLure',
	deactivate: 'foundation.deactivateCollectionLure',
	reactivate: 'foundation.reactivateCollectionLure',
	remove: 'foundation.deleteCollectionLure',
};

export function useCollectionLureMutations(): CatalogMutations {
	const { organizationId, actorProfileId } = useWriterIdentity();

	const create = useCallback(
		async (fields: CatalogFields) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}
			const row = {
				...catalogRowBase(organizationId, actorProfileId),
				name: fields.name,
				description: fields.description ?? null,
				is_active: fields.isActive,
			} satisfies CollectionLure;
			await createCatalogRow(collection_lures, collectionLureCommands, row);
			return row.id;
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(async (id: string, fields: CatalogFields, current: CatalogFields) => {
		const changes: Partial<CollectionLure> = {};
		if (fields.name !== current.name) {
			changes.name = fields.name;
		}
		if (fields.description !== current.description) {
			changes.description = fields.description ?? null;
		}
		await saveCatalogRow(collection_lures, collectionLureCommands, id, {
			changes,
			isActive: fields.isActive,
			wasActive: current.isActive,
		});
	}, []);

	return catalogMutations(collection_lures, collectionLureCommands, {
		create,
		save,
		canWrite: organizationId !== null && actorProfileId !== null,
	});
}

const habitatTypeCommands: CatalogCommandNames = {
	create: 'foundation.createHabitatType',
	update: 'foundation.updateHabitatType',
	deactivate: 'foundation.deactivateHabitatType',
	reactivate: 'foundation.reactivateHabitatType',
	remove: 'foundation.deleteHabitatType',
};

export function useHabitatTypeMutations(): CatalogMutations {
	const { organizationId, actorProfileId } = useWriterIdentity();

	const create = useCallback(
		async (fields: CatalogFields) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}
			const row = {
				...catalogRowBase(organizationId, actorProfileId),
				name: fields.name,
				description: fields.description ?? null,
				custom_schema: fields.customSchema ?? null,
				is_active: fields.isActive,
			} satisfies HabitatType;
			await createCatalogRow(habitat_types, habitatTypeCommands, row);
			return row.id;
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(async (id: string, fields: CatalogFields, current: CatalogFields) => {
		const changes: Partial<HabitatType> = {};
		if (fields.name !== current.name) {
			changes.name = fields.name;
		}
		if (fields.description !== current.description) {
			changes.description = fields.description ?? null;
		}
		if (fields.customSchema !== current.customSchema) {
			changes.custom_schema = fields.customSchema ?? null;
		}
		await saveCatalogRow(habitat_types, habitatTypeCommands, id, {
			changes,
			isActive: fields.isActive,
			wasActive: current.isActive,
		});
	}, []);

	return catalogMutations(habitat_types, habitatTypeCommands, {
		create,
		save,
		canWrite: organizationId !== null && actorProfileId !== null,
	});
}

const notificationTypeCommands: CatalogCommandNames = {
	create: 'publicEngagement.createNotificationType',
	update: 'publicEngagement.updateNotificationType',
	deactivate: 'publicEngagement.deactivateNotificationType',
	reactivate: 'publicEngagement.reactivateNotificationType',
	remove: 'publicEngagement.deleteNotificationType',
};

export function useNotificationTypeMutations(): CatalogMutations {
	const { organizationId, actorProfileId } = useWriterIdentity();

	const create = useCallback(
		async (fields: CatalogFields) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}
			const row = {
				...catalogRowBase(organizationId, actorProfileId),
				name: fields.name,
				description: fields.description ?? null,
				is_active: fields.isActive,
			} satisfies NotificationType;
			await createCatalogRow(notification_types, notificationTypeCommands, row);
			return row.id;
		},
		[organizationId, actorProfileId],
	);

	const save = useCallback(async (id: string, fields: CatalogFields, current: CatalogFields) => {
		const changes: Partial<NotificationType> = {};
		if (fields.name !== current.name) {
			changes.name = fields.name;
		}
		if (fields.description !== current.description) {
			changes.description = fields.description ?? null;
		}
		await saveCatalogRow(notification_types, notificationTypeCommands, id, {
			changes,
			isActive: fields.isActive,
			wasActive: current.isActive,
		});
	}, []);

	return catalogMutations(notification_types, notificationTypeCommands, {
		create,
		save,
		canWrite: organizationId !== null && actorProfileId !== null,
	});
}

export function useApplicationMethodMutations(): CatalogMutations {
	return useControlMethodMutations(application_methods, {
		create: 'controlOperations.createApplicationMethod',
		update: 'controlOperations.updateApplicationMethod',
		deactivate: 'controlOperations.deactivateApplicationMethod',
		reactivate: 'controlOperations.reactivateApplicationMethod',
		remove: 'controlOperations.deleteApplicationMethod',
	});
}

export function useSourceReductionMethodMutations(): CatalogMutations {
	return useControlMethodMutations(source_reduction_methods, {
		create: 'controlOperations.createSourceReductionMethod',
		update: 'controlOperations.updateSourceReductionMethod',
		deactivate: 'controlOperations.deactivateSourceReductionMethod',
		reactivate: 'controlOperations.reactivateSourceReductionMethod',
		remove: 'controlOperations.deleteSourceReductionMethod',
	});
}

export function useOutreachMethodMutations(): CatalogMutations {
	return useControlMethodMutations(outreach_methods, {
		create: 'controlOperations.createOutreachMethod',
		update: 'controlOperations.updateOutreachMethod',
		deactivate: 'controlOperations.deactivateOutreachMethod',
		reactivate: 'controlOperations.reactivateOutreachMethod',
		remove: 'controlOperations.deleteOutreachMethod',
	});
}

export function useBiocontrolMethodMutations(): CatalogMutations {
	return useControlMethodMutations(biocontrol_methods, {
		create: 'controlOperations.createBiocontrolMethod',
		update: 'controlOperations.updateBiocontrolMethod',
		deactivate: 'controlOperations.deactivateBiocontrolMethod',
		reactivate: 'controlOperations.reactivateBiocontrolMethod',
		remove: 'controlOperations.deleteBiocontrolMethod',
	});
}

/**
 * The four control-method catalogs, which really are one table four times.
 *
 * `application_methods`, `source_reduction_methods`, `outreach_methods` and
 * `biocontrol_methods` have identical columns — a name and a custom schema — so
 * unlike the four above, one row literal covers them and the collection can be a
 * parameter. The catalog is fixed per call site, so which query and which
 * commands a given hook slot runs never changes between renders.
 */
function useControlMethodMutations(
	collection: typeof application_methods,
	names: CatalogCommandNames,
): CatalogMutations {
	const { organizationId, actorProfileId } = useWriterIdentity();

	const create = useCallback(
		async (fields: CatalogFields) => {
			if (organizationId === null) {
				throw new Error('Your profile is still loading.');
			}
			const row = {
				...catalogRowBase(organizationId, actorProfileId),
				name: fields.name,
				custom_schema: fields.customSchema ?? null,
				is_active: fields.isActive,
			} satisfies ApplicationMethod;
			await createCatalogRow(collection, names, row);
			return row.id;
		},
		[collection, names, organizationId, actorProfileId],
	);

	const save = useCallback(
		async (id: string, fields: CatalogFields, current: CatalogFields) => {
			const changes: Partial<ApplicationMethod> = {};
			if (fields.name !== current.name) {
				changes.name = fields.name;
			}
			if (fields.customSchema !== current.customSchema) {
				changes.custom_schema = fields.customSchema ?? null;
			}
			await saveCatalogRow(collection, names, id, {
				changes,
				isActive: fields.isActive,
				wasActive: current.isActive,
			});
		},
		[collection, names],
	);

	return catalogMutations(collection, names, {
		create,
		save,
		canWrite: organizationId !== null && actorProfileId !== null,
	});
}

/**
 * The half of every catalog hook that does not depend on the catalog.
 *
 * `setActive` and `remove` name the row and nothing else, so they are the same
 * two calls eight times over; only `create` and `save` have to know the columns.
 * Not a hook — it takes the two bound callbacks and assembles the result, which
 * is what keeps the eight hooks above down to their row literal and their names.
 */
function catalogMutations<TRow extends CatalogRow>(
	collection: CatalogCollection<TRow>,
	names: CatalogCommandNames,
	bound: {
		readonly create: (fields: CatalogFields) => Promise<string>;
		readonly save: (id: string, fields: CatalogFields, current: CatalogFields) => Promise<void>;
		readonly canWrite: boolean;
	},
): CatalogMutations {
	return {
		create: bound.create,
		save: bound.save,
		setActive: (id, isActive) => setCatalogRowActive(collection, names, id, isActive),
		remove: (id) => deleteCatalogRow(collection, names, id),
		canWrite: bound.canWrite,
	};
}

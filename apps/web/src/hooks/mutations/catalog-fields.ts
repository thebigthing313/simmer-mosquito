import type { Acknowledgements } from '../use-acknowledged-write';
import {
	type CatalogCollection,
	type CatalogCommandNames,
	type CatalogRow,
	deleteCatalogRow,
	setCatalogRowActive,
} from './catalog-writes';
import { newRecordId, optimisticStamp } from './shared';

/**
 * The questions a catalog's writes can be refused over, keyed and valued by the
 * flag that answers each.
 *
 * `CATALOG_SAVE_REFUSALS` for seven of the eight, and
 * `NOTIFICATION_TYPE_SAVE_REFUSALS` for notification types, which carry a second
 * question.
 */
export type CatalogRefusals = Readonly<Record<string, string>>;

/**
 * The flags a catalog write carries, answered only where the write can actually
 * be refused over them.
 *
 * Two tests, and a flag needs both. The write has to raise the question: a
 * description-only edit renames nothing, and a save that leaves the switch alone
 * retires nothing. And the catalog has to have it: retiring a habitat type
 * strands no subscribers, so its map does not carry that flag, and sending a
 * `false` for it would answer a question no page can put.
 */
export function catalogAcknowledgements(
	refusals: CatalogRefusals,
	answered: Acknowledgements,
	raised: { readonly renames: boolean; readonly retires: boolean },
): Acknowledgements {
	const askable: readonly string[] = Object.values(refusals);
	const flags: Record<string, boolean> = {};
	if (raised.renames && askable.includes('acknowledgedHistoricalLabelChange')) {
		flags.acknowledgedHistoricalLabelChange = answered.acknowledgedHistoricalLabelChange === true;
	}
	if (raised.retires && askable.includes('acknowledgedActiveSubscriptionImpact')) {
		flags.acknowledgedActiveSubscriptionImpact =
			answered.acknowledgedActiveSubscriptionImpact === true;
	}
	return flags;
}

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
	readonly save: (
		id: string,
		fields: CatalogFields,
		current: CatalogFields,
		acknowledgements: Acknowledgements,
	) => Promise<void>;
	/** The one-click retire and restore on the row menu. */
	readonly setActive: (
		id: string,
		isActive: boolean,
		acknowledgements: Acknowledgements,
	) => Promise<void>;
	readonly remove: (id: string) => Promise<void>;
	/**
	 * The questions this catalog's writes can be refused over.
	 *
	 * Carried on the mutations rather than read off the page, because which
	 * questions there are is a property of the catalog and not of the screen it is
	 * edited on. A page holds whichever catalog it was handed and passes this
	 * straight to `useAcknowledgedWrite`.
	 */
	readonly refusals: CatalogRefusals;
	/** False while the auth snapshot is still resolving; every write throws until then. */
	readonly canWrite: boolean;
}

/** The columns every catalog row carries, stamped the same way on every create. */
export function catalogRowBase(organizationId: string, actorProfileId: string | null) {
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

export const collectionMethodCommands: CatalogCommandNames = {
	create: 'foundation.createCollectionMethod',
	update: 'foundation.updateCollectionMethod',
	deactivate: 'foundation.deactivateCollectionMethod',
	reactivate: 'foundation.reactivateCollectionMethod',
	remove: 'foundation.deleteCollectionMethod',
};

export const collectionLureCommands: CatalogCommandNames = {
	create: 'foundation.createCollectionLure',
	update: 'foundation.updateCollectionLure',
	deactivate: 'foundation.deactivateCollectionLure',
	reactivate: 'foundation.reactivateCollectionLure',
	remove: 'foundation.deleteCollectionLure',
};

export const habitatTypeCommands: CatalogCommandNames = {
	create: 'foundation.createHabitatType',
	update: 'foundation.updateHabitatType',
	deactivate: 'foundation.deactivateHabitatType',
	reactivate: 'foundation.reactivateHabitatType',
	remove: 'foundation.deleteHabitatType',
};

export const notificationTypeCommands: CatalogCommandNames = {
	create: 'publicEngagement.createNotificationType',
	update: 'publicEngagement.updateNotificationType',
	deactivate: 'publicEngagement.deactivateNotificationType',
	reactivate: 'publicEngagement.reactivateNotificationType',
	remove: 'publicEngagement.deleteNotificationType',
};

/**
 * The half of every catalog hook that does not depend on the catalog.
 *
 * `setActive` and `remove` name the row and nothing else, so they are the same
 * two calls eight times over; only `create` and `save` have to know the columns.
 * Not a hook — it takes the two bound callbacks and assembles the result, which
 * is what keeps the eight hooks above down to their row literal and their names.
 */
export function catalogMutations<TRow extends CatalogRow>(
	collection: CatalogCollection<TRow>,
	names: CatalogCommandNames,
	refusals: CatalogRefusals,
	bound: {
		readonly create: (fields: CatalogFields) => Promise<string>;
		readonly save: (
			id: string,
			fields: CatalogFields,
			current: CatalogFields,
			acknowledgements: Acknowledgements,
		) => Promise<void>;
		readonly canWrite: boolean;
	},
): CatalogMutations {
	return {
		create: bound.create,
		save: bound.save,
		setActive: (id, isActive, acknowledgements) =>
			setCatalogRowActive(
				collection,
				names,
				id,
				isActive,
				catalogAcknowledgements(refusals, acknowledgements, {
					renames: false,
					retires: !isActive,
				}),
			),
		remove: (id) => deleteCatalogRow(collection, names, id),
		refusals,
		canWrite: bound.canWrite,
	};
}

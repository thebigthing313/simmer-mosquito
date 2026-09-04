/**
 * The agency's lookup catalogs, as their management pages need them.
 *
 * The wider read behind `use-catalog-rosters.ts`. A roster answers "what may this
 * field be set to" and returns three columns; these pages are where the catalog is
 * *maintained*, so they need every column the dialog edits and both halves of the
 * lifecycle split — active rows and retired ones, each already in name order.
 *
 * Two queries rather than one list the page partitions: `is_active` is a pushed-
 * down predicate, and the split is what the page frame is built around. It is also
 * what keeps the retired half from re-rendering when an active row is renamed.
 *
 * The eight catalogs are four shapes, so there are four helpers here and eight
 * hooks in front of them. Each hook fixes its own collection rather than taking
 * one, for the reason recorded in `use-catalog-rosters.ts`: a collection that
 * changed between renders would change which query runs under one hook slot.
 */

import { eq, useLiveSuspenseQuery } from '@tanstack/react-db';
import { application_methods } from '../../lib/collections/application_methods';
import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { collection_lures } from '../../lib/collections/collection_lures';
import { collection_methods } from '../../lib/collections/collection_methods';
import { habitat_types } from '../../lib/collections/habitat_types';
import { notification_types } from '../../lib/collections/notification_types';
import { outreach_methods } from '../../lib/collections/outreach_methods';
import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';

/** What every catalog page shows and every catalog dialog edits. */
export interface NamedCatalogRecord {
	readonly id: string;
	readonly name: string;
	readonly isActive: boolean;
}

export interface DescribedCatalogRecord extends NamedCatalogRecord {
	readonly description: string | null;
}

export interface SchemaCatalogRecord extends DescribedCatalogRecord {
	readonly customSchema: unknown;
}

/** Collection methods alone carry a count that warrants a response. */
export interface CollectionMethodRecord extends SchemaCatalogRecord {
	readonly actionThreshold: number | null;
}

/** A control method is a name and whatever extra fields the agency attached. */
export interface ControlMethodRecord extends NamedCatalogRecord {
	readonly customSchema: unknown;
}

/** The two halves of a catalog, each in name order. */
export interface CatalogRecords<TRecord> {
	readonly activeRecords: readonly TRecord[];
	readonly inactiveRecords: readonly TRecord[];
}

export function useCollectionMethodRecords(): CatalogRecords<CollectionMethodRecord> {
	return {
		activeRecords: useCollectionMethodHalf(true),
		inactiveRecords: useCollectionMethodHalf(false),
	};
}

function useCollectionMethodHalf(isActive: boolean): readonly CollectionMethodRecord[] {
	return useLiveSuspenseQuery(
		(query) =>
			query
				.from({ row: collection_methods() })
				.where(({ row }) => eq(row.is_active, isActive))
				.orderBy(({ row }) => row.name, 'asc')
				.select(({ row }) => ({
					id: row.id,
					name: row.name,
					description: row.description,
					customSchema: row.custom_schema,
					actionThreshold: row.action_threshold,
					isActive: row.is_active,
				})),
		[isActive],
	).data;
}

export function useHabitatTypeRecords(): CatalogRecords<SchemaCatalogRecord> {
	return {
		activeRecords: useHabitatTypeHalf(true),
		inactiveRecords: useHabitatTypeHalf(false),
	};
}

function useHabitatTypeHalf(isActive: boolean): readonly SchemaCatalogRecord[] {
	return useLiveSuspenseQuery(
		(query) =>
			query
				.from({ row: habitat_types() })
				.where(({ row }) => eq(row.is_active, isActive))
				.orderBy(({ row }) => row.name, 'asc')
				.select(({ row }) => ({
					id: row.id,
					name: row.name,
					description: row.description,
					customSchema: row.custom_schema,
					isActive: row.is_active,
				})),
		[isActive],
	).data;
}

export function useCollectionLureRecords(): CatalogRecords<DescribedCatalogRecord> {
	return {
		activeRecords: useDescribedHalf(collection_lures(), true),
		inactiveRecords: useDescribedHalf(collection_lures(), false),
	};
}

export function useNotificationTypeRecords(): CatalogRecords<DescribedCatalogRecord> {
	return {
		activeRecords: useDescribedHalf(notification_types(), true),
		inactiveRecords: useDescribedHalf(notification_types(), false),
	};
}

/**
 * The two catalogs that are a name and a description and nothing else.
 *
 * `collection_lures` and `notification_types` have identical columns, so their row
 * types are the same type and one query covers both.
 */
function useDescribedHalf(
	collection: ReturnType<typeof collection_lures>,
	isActive: boolean,
): readonly DescribedCatalogRecord[] {
	return useLiveSuspenseQuery(
		(query) =>
			query
				.from({ row: collection })
				.where(({ row }) => eq(row.is_active, isActive))
				.orderBy(({ row }) => row.name, 'asc')
				.select(({ row }) => ({
					id: row.id,
					name: row.name,
					description: row.description,
					isActive: row.is_active,
				})),
		[collection, isActive],
	).data;
}

export function useApplicationMethodRecords(): CatalogRecords<ControlMethodRecord> {
	return {
		activeRecords: useControlMethodHalf(application_methods(), true),
		inactiveRecords: useControlMethodHalf(application_methods(), false),
	};
}

export function useSourceReductionMethodRecords(): CatalogRecords<ControlMethodRecord> {
	return {
		activeRecords: useControlMethodHalf(source_reduction_methods(), true),
		inactiveRecords: useControlMethodHalf(source_reduction_methods(), false),
	};
}

export function useOutreachMethodRecords(): CatalogRecords<ControlMethodRecord> {
	return {
		activeRecords: useControlMethodHalf(outreach_methods(), true),
		inactiveRecords: useControlMethodHalf(outreach_methods(), false),
	};
}

export function useBiocontrolMethodRecords(): CatalogRecords<ControlMethodRecord> {
	return {
		activeRecords: useControlMethodHalf(biocontrol_methods(), true),
		inactiveRecords: useControlMethodHalf(biocontrol_methods(), false),
	};
}

/** The four control-method catalogs, which have identical columns. */
function useControlMethodHalf(
	collection: ReturnType<typeof application_methods>,
	isActive: boolean,
): readonly ControlMethodRecord[] {
	return useLiveSuspenseQuery(
		(query) =>
			query
				.from({ row: collection })
				.where(({ row }) => eq(row.is_active, isActive))
				.orderBy(({ row }) => row.name, 'asc')
				.select(({ row }) => ({
					id: row.id,
					name: row.name,
					customSchema: row.custom_schema,
					isActive: row.is_active,
				})),
		[collection, isActive],
	).data;
}

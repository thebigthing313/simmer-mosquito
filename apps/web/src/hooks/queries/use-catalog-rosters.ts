/**
 * The agency's catalogs, as the record forms need them.
 *
 * One file for all of them, because they are one question asked of seven tables:
 * what may this field be set to. The explorers ask a narrower one — see
 * `components/explorer/use-control-method-options.ts`, which returns filter
 * options and an id→name lookup and drops everything else.
 *
 * A form needs two things those drop:
 *
 * `isActive`, because a retired catalog row stays selectable. These forms are
 * where past seasons get keyed in, and a method the agency dropped last year is
 * exactly what a record from last year was worked with. `lifecycleOptions` marks
 * the row and sorts it behind everything still in service.
 *
 * `customSchema`, because a catalog row can carry extra fields the agency defined,
 * and picking the method is what decides which of them the form renders.
 * `collection_lures` is the one catalog without that column, which is why the
 * roster comes in two shapes rather than one.
 *
 * Every catalog here is eager, so none of this costs a request. The reads suspend
 * for the same reason the explorer options do: the rows are there before a form
 * can be reached.
 */

import type { Collection } from '@tanstack/db';
import { useLiveSuspenseQuery } from '@tanstack/react-db';
import { application_methods } from '../../lib/collections/application_methods';
import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { collection_lures } from '../../lib/collections/collection_lures';
import { collection_methods } from '../../lib/collections/collection_methods';
import { habitat_types } from '../../lib/collections/habitat_types';
import { notification_types } from '../../lib/collections/notification_types';
import { outreach_methods } from '../../lib/collections/outreach_methods';
import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';

/** A catalog row as a picker reads one. */
export interface CatalogListing {
	readonly id: string;
	readonly name: string;
	readonly isActive: boolean;
}

/** The same, plus whatever extra fields the agency attached to this row. */
export interface SchemaCatalogListing extends CatalogListing {
	readonly customSchema: unknown;
}

export function useHabitatTypeRoster(): readonly SchemaCatalogListing[] {
	return useSchemaCatalogRoster(habitat_types);
}

export function useCollectionMethodRoster(): readonly SchemaCatalogListing[] {
	return useSchemaCatalogRoster(collection_methods);
}

export function useApplicationMethodRoster(): readonly SchemaCatalogListing[] {
	return useSchemaCatalogRoster(application_methods);
}

export function useSourceReductionMethodRoster(): readonly SchemaCatalogListing[] {
	return useSchemaCatalogRoster(source_reduction_methods);
}

export function useBiocontrolMethodRoster(): readonly SchemaCatalogListing[] {
	return useSchemaCatalogRoster(biocontrol_methods);
}

export function useOutreachMethodRoster(): readonly SchemaCatalogListing[] {
	return useSchemaCatalogRoster(outreach_methods);
}

/** Lures carry no custom schema — the one catalog on the plain shape. */
export function useCollectionLureRoster(): readonly CatalogListing[] {
	return usePlainCatalogRoster(collection_lures);
}

/** Nor do notification types — the mission form picks one to notify residents by. */
export function useNotificationTypeRoster(): readonly CatalogListing[] {
	return usePlainCatalogRoster(notification_types);
}

/**
 * The two catalogs with no custom schema.
 *
 * `collection_lures` and `notification_types` have identical columns, so their
 * row types are the same type and one query covers both.
 */
function usePlainCatalogRoster(collection: typeof collection_lures): readonly CatalogListing[] {
	const result = useLiveSuspenseQuery(
		(query) =>
			query.from({ row: collection }).select(({ row }) => ({
				id: row.id,
				name: row.name,
				isActive: row.is_active,
			})),
		[collection],
	);

	return result.data;
}

/**
 * The generic behind the six above.
 *
 * Written as a helper each named hook calls once, rather than one hook taking a
 * collection: a caller passing a different collection between renders would
 * change which query runs under the same hook slot, and naming them keeps the
 * call sites reading as what they fetch.
 */
function useSchemaCatalogRoster<
	TRow extends {
		readonly id: string;
		readonly name: string;
		readonly is_active: boolean;
		readonly custom_schema: unknown;
	},
>(collection: Collection<TRow, string | number>): readonly SchemaCatalogListing[] {
	const result = useLiveSuspenseQuery(
		(query) =>
			query.from({ row: collection }).select(({ row }) => ({
				id: row.id,
				name: row.name,
				isActive: row.is_active,
				customSchema: row.custom_schema,
			})),
		[collection],
	);

	return result.data;
}

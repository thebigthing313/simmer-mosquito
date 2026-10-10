/**
 * The Organization Lookup catalogs, one descriptor each.
 *
 * Not a hook, so not a `use-` file. `useCatalogRecords`, `useCatalogRoster`
 * and `useCatalogOptions` each take a descriptor from here and write the one
 * query their view needs, so a catalog's read side is declared once: which
 * collection, which column holds the name, and which fields each view carries
 * beyond `id`, `name` and `isActive`.
 *
 * A descriptor is checked against its table's row type where it is written. A
 * `nameColumn` the row does not have, or one that is not a string, fails
 * `tsc`, and so does a projection reading a column the row does not have.
 */

import type { Ref, ResultTypeFromSelect, SelectObject } from '@tanstack/react-db';
import { application_methods } from '../../lib/collections/application_methods';
import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { collection_lures } from '../../lib/collections/collection_lures';
import { collection_methods } from '../../lib/collections/collection_methods';
import { equipment } from '../../lib/collections/equipment';
import { habitat_types } from '../../lib/collections/habitat_types';
import { notification_types } from '../../lib/collections/notification_types';
import { outreach_methods } from '../../lib/collections/outreach_methods';
import { profiles } from '../../lib/collections/profiles';
import type { CollectionResolver, SyncedRow } from '../../lib/collections/registry';
import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';
import { tags } from '../../lib/collections/tags';
import { vehicles } from '../../lib/collections/vehicles';

/** A row a catalog view can read: keyed by `id`, with a lifecycle flag. */
interface CatalogRow extends SyncedRow {
	readonly is_active: boolean;
}

/** The columns of `TRow` that hold a string, which is what a name column has to be. */
type StringColumn<TRow> = {
	[TKey in keyof TRow]-?: TRow[TKey] extends string ? TKey : never;
}[keyof TRow] &
	string;

/**
 * A catalog row as the view hooks read it: the two columns every catalog has,
 * and the rest by name. The names were checked where the descriptor was written.
 */
export type CatalogQueryRow = CatalogRow & Readonly<Record<string, unknown>>;

/**
 * One catalog's read side, as the three view hooks take it.
 *
 * `TRecord` and `TListing` are the fields a catalog page and a record form
 * read beyond `id`, `name` and `isActive`, computed by {@link defineCatalog}
 * from the columns each projection reads rather than asserted beside them.
 */
export interface CatalogDescriptor<
	TRecord extends object = object,
	TListing extends object = object,
> {
	/** The table's collection, resolved on call. */
	readonly collection: CollectionResolver<CatalogQueryRow>;
	/** The column every view reads as `name` and orders by. */
	readonly nameColumn: string;
	/** The select shape behind `TRecord`. */
	readonly recordFields: (row: Ref<CatalogQueryRow>) => SelectObject;
	/** The select shape behind `TListing`. */
	readonly listingFields: (row: Ref<CatalogQueryRow>) => SelectObject;
	/** Never set. Carries `TRecord` and `TListing` to the hooks. */
	readonly fieldTypes?: { readonly record: TRecord; readonly listing: TListing };
}

/** A descriptor, checked against the row type its collection carries. */
function defineCatalog<
	TRow extends CatalogRow,
	TRecordFields extends SelectObject,
	TListingFields extends SelectObject,
>(spec: {
	readonly collection: CollectionResolver<TRow>;
	readonly nameColumn: StringColumn<NoInfer<TRow>>;
	readonly recordFields: (row: Ref<NoInfer<TRow>>) => TRecordFields;
	readonly listingFields: (row: Ref<NoInfer<TRow>>) => TListingFields;
}): CatalogDescriptor<ResultTypeFromSelect<TRecordFields>, ResultTypeFromSelect<TListingFields>> {
	// The one place the row type is erased: the hooks read every catalog through
	// the same query, and each column it names was checked against `TRow` above.
	return spec as unknown as CatalogDescriptor<
		ResultTypeFromSelect<TRecordFields>,
		ResultTypeFromSelect<TListingFields>
	>;
}

/** A row's name, read through the column the descriptor names. */
export function catalogName(
	catalog: CatalogDescriptor,
	row: Ref<CatalogQueryRow>,
): Ref<{ readonly name: string }>['name'] {
	// `defineCatalog` held `nameColumn` to a string column of the row.
	return row[catalog.nameColumn] as Ref<{ readonly name: string }>['name'];
}

/** A view that carries nothing beyond `id`, `name` and `isActive`. */
const noFields = (): Record<never, never> => ({});

/** The extra fields an organization attached to a catalog row. */
const customSchemaFields = (row: Ref<CatalogRow & { readonly custom_schema: unknown }>) => ({
	customSchema: row.custom_schema,
});

/** A catalog row's description. */
const descriptionFields = (row: Ref<CatalogRow & { readonly description: string | null }>) => ({
	description: row.description,
});

/** Every catalog on the register, keyed by what a call site names it. */
export const catalogs = {
	applicationMethods: defineCatalog({
		collection: application_methods,
		nameColumn: 'name',
		recordFields: customSchemaFields,
		listingFields: customSchemaFields,
	}),
	sourceReductionMethods: defineCatalog({
		collection: source_reduction_methods,
		nameColumn: 'name',
		recordFields: customSchemaFields,
		listingFields: customSchemaFields,
	}),
	biocontrolMethods: defineCatalog({
		collection: biocontrol_methods,
		nameColumn: 'name',
		recordFields: customSchemaFields,
		listingFields: customSchemaFields,
	}),
	outreachMethods: defineCatalog({
		collection: outreach_methods,
		nameColumn: 'name',
		recordFields: customSchemaFields,
		listingFields: customSchemaFields,
	}),
	collectionLures: defineCatalog({
		collection: collection_lures,
		nameColumn: 'name',
		recordFields: descriptionFields,
		listingFields: noFields,
	}),
	notificationTypes: defineCatalog({
		collection: notification_types,
		nameColumn: 'name',
		recordFields: descriptionFields,
		listingFields: noFields,
	}),
	habitatTypes: defineCatalog({
		collection: habitat_types,
		nameColumn: 'name',
		recordFields: (row) => ({ description: row.description, customSchema: row.custom_schema }),
		listingFields: customSchemaFields,
	}),
	collectionMethods: defineCatalog({
		collection: collection_methods,
		nameColumn: 'name',
		recordFields: (row) => ({
			description: row.description,
			customSchema: row.custom_schema,
			actionThreshold: row.action_threshold,
		}),
		listingFields: customSchemaFields,
	}),
	vehicles: defineCatalog({
		collection: vehicles,
		nameColumn: 'vehicle_name',
		recordFields: (row) => ({
			// A literal rather than a column, so a vehicle and a piece of equipment
			// are one shape and the page never asks which table a row came from.
			serialNumber: null as string | null,
			metadata: row.metadata,
		}),
		listingFields: noFields,
	}),
	equipment: defineCatalog({
		collection: equipment,
		nameColumn: 'equipment_name',
		recordFields: (row) => ({ serialNumber: row.serial_number, metadata: row.metadata }),
		listingFields: noFields,
	}),
	tags: defineCatalog({
		collection: tags,
		nameColumn: 'tag_name',
		recordFields: (row) => ({
			description: row.description,
			color: row.color,
			relevantEntityTypes: row.relevant_entity_types,
		}),
		listingFields: noFields,
	}),
	profiles: defineCatalog({
		collection: profiles,
		nameColumn: 'display_name',
		recordFields: noFields,
		listingFields: noFields,
	}),
} as const;

import { collection_methods } from '../../lib/collections/collection_methods';
import type { SchemaCatalogListing } from './catalog-roster-view';
import { useSchemaCatalogRoster } from './use-schema-catalog-roster';

/** The organization's collection methods as a record form picks from them, retired rows included. */
export function useCollectionMethodRoster(): readonly SchemaCatalogListing[] {
	return useSchemaCatalogRoster(collection_methods());
}

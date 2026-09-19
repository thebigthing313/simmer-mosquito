import { collection_lures } from '../../lib/collections/collection_lures';
import type { CatalogListing } from './catalog-roster-view';
import { usePlainCatalogRoster } from './use-plain-catalog-roster';

/** The organization's collection lures as a record form picks from them, retired rows included. */
export function useCollectionLureRoster(): readonly CatalogListing[] {
	return usePlainCatalogRoster(collection_lures());
}

import { collection_lures } from '../../lib/collections/collection_lures';
import type { CatalogRecords, DescribedCatalogRecord } from './catalog-record-view';
import { useDescribedHalf } from './use-described-half';

/** The organization's collection lures as their catalog page maintains them: the active rows and the retired rows, each in name order. */
export function useCollectionLureRecords(): CatalogRecords<DescribedCatalogRecord> {
	return {
		activeRecords: useDescribedHalf(collection_lures(), true),
		inactiveRecords: useDescribedHalf(collection_lures(), false),
	};
}

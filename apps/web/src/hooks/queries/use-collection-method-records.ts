import type { CatalogRecords, CollectionMethodRecord } from './catalog-record-view';
import { useCollectionMethodHalf } from './use-collection-method-half';

/** The organization's collection methods as their catalog page maintains them: the active rows and the retired rows, each in name order. */
export function useCollectionMethodRecords(): CatalogRecords<CollectionMethodRecord> {
	return {
		activeRecords: useCollectionMethodHalf(true),
		inactiveRecords: useCollectionMethodHalf(false),
	};
}

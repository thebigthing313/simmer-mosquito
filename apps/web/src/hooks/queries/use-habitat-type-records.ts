import type { CatalogRecords, SchemaCatalogRecord } from './catalog-record-view';
import { useHabitatTypeHalf } from './use-habitat-type-half';

/** The organization's habitat types as their catalog page maintains them: the active rows and the retired rows, each in name order. */
export function useHabitatTypeRecords(): CatalogRecords<SchemaCatalogRecord> {
	return {
		activeRecords: useHabitatTypeHalf(true),
		inactiveRecords: useHabitatTypeHalf(false),
	};
}

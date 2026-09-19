import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';
import { type CatalogOptions, useNamedCatalog } from './use-named-catalog';

/** Source reduction methods, as filter options and an id to name lookup. Retired methods are included. */
export function useSourceReductionMethodOptions(): CatalogOptions {
	return useNamedCatalog(source_reduction_methods());
}

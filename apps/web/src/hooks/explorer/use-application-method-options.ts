import { application_methods } from '../../lib/collections/application_methods';
import { type CatalogOptions, useNamedCatalog } from './use-named-catalog';

/** Application methods, as filter options and an id to name lookup. Retired methods are included. */
export function useApplicationMethodOptions(): CatalogOptions {
	return useNamedCatalog(application_methods());
}

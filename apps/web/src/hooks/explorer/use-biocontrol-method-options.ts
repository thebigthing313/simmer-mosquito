import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import { type CatalogOptions, useNamedCatalog } from './use-named-catalog';

/** Biocontrol methods, as filter options and an id to name lookup. Retired methods are included. */
export function useBiocontrolMethodOptions(): CatalogOptions {
	return useNamedCatalog(biocontrol_methods());
}

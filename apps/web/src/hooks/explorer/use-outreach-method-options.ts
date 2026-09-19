import { outreach_methods } from '../../lib/collections/outreach_methods';
import { type CatalogOptions, useNamedCatalog } from './use-named-catalog';

/** Outreach methods, as filter options and an id to name lookup. Retired methods are included. */
export function useOutreachMethodOptions(): CatalogOptions {
	return useNamedCatalog(outreach_methods());
}

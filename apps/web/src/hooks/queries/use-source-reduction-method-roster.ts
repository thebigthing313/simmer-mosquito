import { source_reduction_methods } from '../../lib/collections/source_reduction_methods';
import type { SchemaCatalogListing } from './catalog-roster-view';
import { useSchemaCatalogRoster } from './use-schema-catalog-roster';

/** The organization's source reduction methods as a record form picks from them, retired rows included. */
export function useSourceReductionMethodRoster(): readonly SchemaCatalogListing[] {
	return useSchemaCatalogRoster(source_reduction_methods());
}

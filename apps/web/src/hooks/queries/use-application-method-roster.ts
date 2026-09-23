import { application_methods } from '../../lib/collections/application_methods';
import type { SchemaCatalogListing } from './catalog-roster-view';
import { useSchemaCatalogRoster } from './use-schema-catalog-roster';

/** The organization's application methods as a record form picks from them, retired rows included. */
export function useApplicationMethodRoster(): readonly SchemaCatalogListing[] {
	return useSchemaCatalogRoster(application_methods());
}

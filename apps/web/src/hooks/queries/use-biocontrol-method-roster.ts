import { biocontrol_methods } from '../../lib/collections/biocontrol_methods';
import type { SchemaCatalogListing } from './catalog-roster-view';
import { useSchemaCatalogRoster } from './use-schema-catalog-roster';

/** The organization's biocontrol methods as a record form picks from them, retired rows included. */
export function useBiocontrolMethodRoster(): readonly SchemaCatalogListing[] {
	return useSchemaCatalogRoster(biocontrol_methods());
}

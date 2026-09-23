import { outreach_methods } from '../../lib/collections/outreach_methods';
import type { SchemaCatalogListing } from './catalog-roster-view';
import { useSchemaCatalogRoster } from './use-schema-catalog-roster';

/** The organization's outreach methods as a record form picks from them, retired rows included. */
export function useOutreachMethodRoster(): readonly SchemaCatalogListing[] {
	return useSchemaCatalogRoster(outreach_methods());
}

import { habitat_types } from '../../lib/collections/habitat_types';
import type { SchemaCatalogListing } from './catalog-roster-view';
import { useSchemaCatalogRoster } from './use-schema-catalog-roster';

/** The organization's habitat types as a record form picks from them, retired rows included. */
export function useHabitatTypeRoster(): readonly SchemaCatalogListing[] {
	return useSchemaCatalogRoster(habitat_types());
}

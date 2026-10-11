import { customSchemaFor } from '@simmer-mosquito/ui-web/components/form';
import { catalogs } from '../queries/catalog-register';
import { useCatalogRoster } from '../queries/use-catalog-roster';
/** The custom field schema of one habitat type, or none when the habitat names no type. */
export function useHabitatTypeSchema(habitatTypeId: string | null): unknown {
	return customSchemaFor(useCatalogRoster(catalogs.habitatTypes), habitatTypeId);
}

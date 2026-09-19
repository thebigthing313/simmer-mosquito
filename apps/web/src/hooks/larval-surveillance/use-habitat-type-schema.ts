import { customSchemaFor } from '@simmer-mosquito/ui-web/components/form';
import { useHabitatTypeRoster } from '../queries/use-catalog-rosters';

/** The custom field schema of one habitat type, or none when the habitat names no type. */
export function useHabitatTypeSchema(habitatTypeId: string | null): unknown {
	return customSchemaFor(useHabitatTypeRoster(), habitatTypeId);
}

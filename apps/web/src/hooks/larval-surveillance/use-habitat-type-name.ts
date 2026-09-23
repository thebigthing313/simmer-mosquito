import { useHabitatTypeRoster } from '../queries/use-habitat-type-roster';
/** The type's name, or `null` when the habitat names no type. */
export function useHabitatTypeName(habitatTypeId: string | null): string | null {
	const habitatTypes = useHabitatTypeRoster();

	if (habitatTypeId === null) {
		return null;
	}

	const match = habitatTypes.find((habitatType) => habitatType.id === habitatTypeId);
	return match?.name ?? 'Unknown type';
}

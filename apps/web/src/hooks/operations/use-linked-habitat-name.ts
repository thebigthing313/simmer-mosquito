import { useHabitatNames } from '../queries/use-habitat-names';

/**
 * One habitat's name by id through the shared `useHabitatNames` subset, or
 * `null` with no id or while it resolves.
 */
export function useLinkedHabitatName(habitatId: string | null): string | null {
	const habitatIds = habitatId === null ? [] : [habitatId];
	const habitatNameById = useHabitatNames(habitatIds);
	return habitatId === null ? null : (habitatNameById.get(habitatId) ?? null);
}

import { useHabitatNames } from '../queries/use-habitat-names';

/**
 * The display label for a habitat known only by id, through the shared
 * `useHabitatNames` lookup, or '' while it resolves or with no id.
 */
export function useHabitatLabel(habitatId: string | null): string {
	const names = useHabitatNames(habitatId === null ? [] : [habitatId]);
	return habitatId === null ? '' : (names.get(habitatId) ?? '');
}
